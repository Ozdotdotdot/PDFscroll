/**
 * Core PDF extraction pipeline.
 * Two-pass approach:
 *   Pass 1 – quick scan all pages for font sizes → compute global median
 *   Pass 2 – full extraction per page with classification, images, formulas
 */

import * as pdfjsLib from 'pdfjs-dist'
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import {
  median,
  groupIntoLines,
  groupIntoParagraphs,
  detectTwoColumn,
  splitColumns,
  isHeaderFooter,
  isAbstractHeading,
  looksLikeAffiliation
} from './textClassifier.js'
import { extractPageImages, cropRegionFromPage } from './imageExtractor.js'
import { isMathItem, groupMathRegions } from './formulaDetector.js'

pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc

/** SHA-256 hash of the first 64 KB of a file */
async function hashFile(arrayBuffer) {
  const slice = arrayBuffer.slice(0, 65536)
  const digest = await crypto.subtle.digest('SHA-256', slice)
  return Array.from(new Uint8Array(digest))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

/** Count words across all content blocks */
function countWords(blocks) {
  return blocks.reduce((n, b) => {
    if (b.text) return n + b.text.split(/\s+/).filter(Boolean).length
    if (b.names) return n + b.names.length
    if (b.items) return n + b.items.join(' ').split(/\s+/).filter(Boolean).length
    return n
  }, 0)
}

/** Guess document title from blocks */
function guessTitle(blocks) {
  const titleBlock = blocks.find(b => b.type === 'title')
  if (titleBlock) return titleBlock.text
  const heading = blocks.find(b => b.type === 'heading' && b.level === 1)
  if (heading) return heading.text
  return 'Untitled Document'
}

/**
 * Main extraction entry point.
 * @param {File} file
 * @param {(current: number, total: number, newBlocks: ContentBlock[]) => void} onProgress
 * @returns {Promise<{fileHash, title, pageCount, wordCount, content}>}
 */
export async function extractPDF(file, onProgress) {
  const arrayBuffer = await file.arrayBuffer()
  const fileHash = await hashFile(arrayBuffer)

  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
  const numPages = pdf.numPages

  // ── Pass 1: collect font sizes ──────────────────────────────────────────
  const allFontSizes = []
  for (let p = 1; p <= numPages; p++) {
    const page = await pdf.getPage(p)
    const tc = await page.getTextContent()
    for (const item of tc.items) {
      const size = item.height || Math.abs(item.transform?.[3]) || 0
      if (size > 0) allFontSizes.push(size)
    }
    page.cleanup()
  }
  const globalMedian = median(allFontSizes) || 11

  // ── Pass 2: full extraction ─────────────────────────────────────────────
  const allBlocks = []
  let isFirstPageDone = false
  let pendingAbstract = false

  for (let pageNum = 1; pageNum <= numPages; pageNum++) {
    const page = await pdf.getPage(pageNum)
    const pageBlocks = await extractPage(
      page, pageNum, numPages, globalMedian, !isFirstPageDone
    )

    // First-page special handling
    if (!isFirstPageDone) {
      isFirstPageDone = true
    }

    allBlocks.push(...pageBlocks)
    onProgress?.(pageNum, numPages, pageBlocks)
    page.cleanup()
  }

  const wordCount = countWords(allBlocks)
  const title = guessTitle(allBlocks)

  return { fileHash, title, pageCount: numPages, wordCount, content: allBlocks }
}

/**
 * Extract all content from a single page and return ContentBlock[].
 */
async function extractPage(page, pageNum, numPages, medianSize, isFirstPage) {
  const viewport = page.getViewport({ scale: 1 })
  const pageWidth  = viewport.width
  const pageHeight = viewport.height

  // ── Text extraction ────────────────────────────────────────────────────
  const textContent = await page.getTextContent({ includeMarkedContent: false })
  let items = textContent.items.filter(it => it.str && it.str.trim())

  // Strip headers/footers
  items = items.filter(it => !isHeaderFooter(it, pageHeight))

  // Detect math items to exclude from normal text flow
  const mathItems = items.filter(it => isMathItem(it, medianSize))
  const mathItemSet = new Set(mathItems)
  const textItems = items.filter(it => !mathItemSet.has(it))

  // Detect layout
  const isTwoCol = detectTwoColumn(textItems, pageWidth)

  let paragraphs = []
  if (isTwoCol) {
    const { left, right } = splitColumns(textItems, pageWidth)
    const leftLines  = groupIntoLines(left)
    const rightLines = groupIntoLines(right)
    const leftParas  = groupIntoParagraphs(leftLines, medianSize)
    const rightParas = groupIntoParagraphs(rightLines, medianSize)
    // Find the y split point (where two-column layout starts)
    const splitY = detectColumnSplitY(leftParas, rightParas, pageHeight)
    // Items above splitY are full-width
    const fullWidthItems = textItems.filter(it => it.transform[5] > splitY + 20)
    const fullWidthLines = groupIntoLines(fullWidthItems)
    const fullWidthParas = groupIntoParagraphs(fullWidthLines, medianSize)
    paragraphs = [...fullWidthParas, ...leftParas, ...rightParas]
  } else {
    const lines = groupIntoLines(textItems)
    paragraphs = groupIntoParagraphs(lines, medianSize)
  }

  // ── Image extraction ──────────────────────────────────────────────────
  let images = []
  try {
    images = await extractPageImages(page, 2)
  } catch (e) {
    console.warn(`Page ${pageNum}: image extraction failed`, e)
  }

  // ── Formula region extraction ─────────────────────────────────────────
  let formulaBlocks = []
  try {
    const mathRegions = groupMathRegions(mathItems, medianSize)
    for (const region of mathRegions) {
      const src = await cropRegionFromPage(page, region, 2)
      if (src) {
        formulaBlocks.push({
          type: 'formula',
          src,
          pdfY: region.y + region.height, // top of region in PDF coords
          inline: region.width < pageWidth * 0.4
        })
      }
    }
  } catch (e) {
    console.warn(`Page ${pageNum}: formula extraction failed`, e)
  }

  // ── Classify and build content blocks ─────────────────────────────────
  const blocks = isFirstPage
    ? buildFirstPageBlocks(paragraphs, images, formulaBlocks, pageHeight, pageWidth)
    : buildNormalPageBlocks(paragraphs, images, formulaBlocks, pageHeight, pageWidth)

  return blocks
}

/**
 * Determine the y level where two-column layout begins.
 * Above this y, content is full-width (e.g., paper title/abstract).
 */
function detectColumnSplitY(leftParas, rightParas, pageHeight) {
  if (leftParas.length === 0 || rightParas.length === 0) return 0
  // Find the highest y of both column starts
  const leftTop  = Math.max(...leftParas.map(p => p.y))
  const rightTop = Math.max(...rightParas.map(p => p.y))
  return Math.min(leftTop, rightTop)
}

/**
 * Return true only if this looks like an academic paper first page:
 * must have a heading-large paragraph AND an "Abstract" keyword.
 * Resumes, reports, and articles will not match.
 */
function looksLikeAcademicPaper(paragraphs) {
  const hasLargeTitle = paragraphs.some(p => p.type === 'heading-large')
  if (!hasLargeTitle) return false
  return paragraphs.some(p => isAbstractHeading(p.text))
}

/**
 * Build content blocks for the first page.
 * For academic papers: extract title / authors / abstract with special styling.
 * For everything else (resumes, reports, articles): fall through to normal processing.
 */
function buildFirstPageBlocks(paragraphs, images, formulaBlocks, pageHeight, pageWidth) {
  if (!looksLikeAcademicPaper(paragraphs)) {
    return buildNormalPageBlocks(paragraphs, images, formulaBlocks, pageHeight, pageWidth)
  }

  const blocks = []
  let state = 'pre-title' // 'pre-title' | 'title' | 'authors' | 'abstract' | 'body'
  let titleText = ''
  let authorNames = []
  let abstractLines = []

  for (const para of paragraphs) {
    const text = para.text.trim()
    if (!text) continue

    if (state === 'pre-title' || state === 'title') {
      if (para.type === 'heading-large') {
        titleText += (titleText ? ' ' : '') + text
        state = 'title'
        continue
      } else if (state === 'title') {
        if (titleText) {
          blocks.push({ type: 'title', text: titleText })
          titleText = ''
        }
        state = 'authors'
      }
    }

    if (state === 'authors') {
      if (isAbstractHeading(text)) {
        if (authorNames.length > 0) {
          blocks.push({ type: 'authors', names: authorNames })
          authorNames = []
        }
        state = 'abstract'
        continue
      }
      // Fix: explicit parentheses to avoid operator-precedence bug.
      // Treat as author/affiliation if text is compact AND non-body typed,
      // OR if it looks like an institutional affiliation line.
      if ((text.length < 200 && para.type !== 'body') || looksLikeAffiliation(text)) {
        if (!looksLikeAffiliation(text)) {
          const names = text.split(/,|\band\b/i).map(n => n.trim()).filter(Boolean)
          authorNames.push(...names)
        }
        // Affiliations are silently skipped
        continue
      }
      // Transitioned out of authors
      if (authorNames.length > 0) {
        blocks.push({ type: 'authors', names: authorNames })
        authorNames = []
      }
      state = 'body'
    }

    if (state === 'abstract') {
      if (para.type === 'heading-small' || para.type === 'heading-large') {
        if (abstractLines.length > 0) {
          blocks.push({ type: 'abstract', text: abstractLines.join(' ') })
          abstractLines = []
        }
        state = 'body'
        blocks.push(paragraphToBlock(para))
        continue
      }
      if (text.length > 20) abstractLines.push(text)
      continue
    }

    if (state === 'body') {
      blocks.push(paragraphToBlock(para))
    }
  }

  // Flush remaining
  if (titleText)                blocks.push({ type: 'title',   text: titleText })
  if (authorNames.length > 0)   blocks.push({ type: 'authors', names: authorNames })
  if (abstractLines.length > 0) blocks.push({ type: 'abstract', text: abstractLines.join(' ') })

  return mergeWithMediaBlocks(blocks, images, formulaBlocks)
}

/**
 * Build content blocks for a normal (non-first) page.
 */
function buildNormalPageBlocks(paragraphs, images, formulaBlocks, pageHeight, pageWidth) {
  const blocks = paragraphs.map(paragraphToBlock).filter(Boolean)
  return mergeWithMediaBlocks(blocks, images, formulaBlocks)
}

/** Convert a paragraph object to a ContentBlock */
function paragraphToBlock(para) {
  if (para.type === 'list') {
    const items = para.items.filter(Boolean)
    if (!items.length) return null
    return { type: 'list', listType: para.listType, items }
  }

  const text = para.text.trim()
  if (!text) return null

  switch (para.type) {
    case 'heading-large':
      return { type: 'heading', level: 1, text }
    case 'heading-small':
      return { type: 'heading', level: 2, text }
    case 'caption':
      return { type: 'caption', text }
    default:
      return { type: 'paragraph', text }
  }
}

/**
 * Merge text blocks with image/formula blocks in reading order.
 * Images are inserted at roughly the position they appear on the page.
 * Since we don't have per-text-block y coordinates post-grouping,
 * we insert images after every N text blocks (proportional placement).
 */
function mergeWithMediaBlocks(textBlocks, images, formulaBlocks) {
  if (images.length === 0 && formulaBlocks.length === 0) return textBlocks

  // For a simple approach, append images after the text blocks
  // In a more sophisticated implementation, we'd interleave by y position
  const result = [...textBlocks]

  // Insert formula blocks (roughly in reading order based on pdfY)
  for (const f of formulaBlocks) {
    result.push({ type: 'formula', src: f.src, inline: f.inline })
  }

  // Insert image blocks
  for (let i = 0; i < images.length; i++) {
    const img = images[i]
    result.push({ type: 'figure', src: img.src, caption: '', width: img.width, height: img.height })
  }

  return result
}
