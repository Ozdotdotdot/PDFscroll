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

/**
 * Matches an inline abstract prefix — "Abstract" followed by any separator
 * (colon, period, dash, em-dash, or plain space) and then substantive content.
 * Captures the content after the prefix.
 * Examples matched: "Abstract This paper...", "Abstract: text...", "Abstract— text..."
 */
const INLINE_ABSTRACT_RE = /^abstract(?:[:\.\-\u2013\u2014]|\s+)\s*(.{20,})/i

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

/** Guess document title from blocks, with filename as fallback */
function guessTitle(blocks, fileName) {
  // 1. Explicit title block (academic papers)
  const titleBlock = blocks.find(b => b.type === 'title')
  if (titleBlock) return titleBlock.text

  // 2. First level-1 heading
  const heading = blocks.find(b => b.type === 'heading' && b.level === 1)
  if (heading) return heading.text

  // 3. First short paragraph — likely a title line in reports/resumes
  const firstPara = blocks.find(b => b.type === 'paragraph' && b.text?.trim().length > 0)
  if (firstPara && firstPara.text.trim().length <= 120) return firstPara.text.trim()

  // 4. Original filename cleaned up
  if (fileName) return fileNameToTitle(fileName)

  return 'Untitled Document'
}

/** Convert a raw filename into a readable title */
function fileNameToTitle(fileName) {
  // Strip all extensions (handles .docx.pdf, .pdf, etc.)
  let name = fileName.replace(/(\.\w+)+$/, '')
  // Replace underscores/hyphens with spaces
  name = name.replace(/[_\-]+/g, ' ').trim()
  return name.charAt(0).toUpperCase() + name.slice(1)
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
  const title = guessTitle(allBlocks, file.name)

  return { fileHash, title, fileName: file.name, pageCount: numPages, wordCount, content: allBlocks }
}

/**
 * Build formula regions from detected math items.
 * For "display math" lines (≥50% of items are math, or line is very short),
 * the region is expanded to cover ALL items on that line so the canvas crop
 * captures the full equation — not just the detected math characters.
 * All items absorbed into display-math regions are excluded from text flow.
 *
 * @param {Array} allItems - All text items on the page (after header/footer strip)
 * @param {Array} mathItems - Subset identified as mathematical
 * @param {number} medianSize - Median font size for the document
 * @returns {{ mathRegions: Array, capturedItemSet: Set }}
 */
function buildFormulaRegions(allItems, mathItems, medianSize, pageWidth) {
  const mathItemSet = new Set(mathItems)
  const initialRegions = groupMathRegions(mathItems, medianSize)
  if (initialRegions.length === 0) {
    return { mathRegions: [], capturedItemSet: mathItemSet }
  }

  const midX = pageWidth ? pageWidth / 2 : null
  const capturedItemSet = new Set(mathItems)
  const mathRegions = []

  for (const region of initialRegions) {
    // Determine which half of the page the formula is in (for cross-column guard).
    const regionCenterX = region.x + region.width / 2
    const formulaIsRight = midX !== null && regionCenterX > midX

    // Items whose y-range overlaps this region (±30% line height tolerance).
    const tol = medianSize * 0.3
    const lineItems = allItems.filter(it => {
      const iy = it.transform[5]
      const ih = it.height || medianSize
      if (!(iy + ih > region.y - tol && iy < region.y + region.height + tol)) return false

      // Don't absorb items from the opposite column.
      if (midX !== null) {
        const ix = it.transform[4]
        const iw = it.width || 0
        // Full-width items (span the centre) are always allowed.
        const spansCenter = ix < midX - 20 && ix + iw > midX + 20
        if (!spansCenter) {
          const itemIsRight = ix + iw / 2 > midX
          if (itemIsRight !== formulaIsRight) return false
        }
      }

      return true
    })

    const mathOnLine = lineItems.filter(it => mathItemSet.has(it)).length
    const total = lineItems.length

    // Display math: very short line (pure equation) OR high math density.
    // Threshold raised to 0.55 to avoid capturing text paragraphs that happen
    // to contain several inline math variables (e.g. "a function f₀(x)...").
    const isDisplayMath = total > 0 && (
      total <= 5 ||
      (total <= 12 && mathOnLine / total > 0.55) ||
      (mathOnLine / total > 0.42 && total <= 25)
    )

    if (isDisplayMath) {
      // Expand region bounding box to cover every item on the line
      let { x, y, width, height } = region
      for (const it of lineItems) {
        const ix = it.transform[4]
        const iy = it.transform[5]
        const iw = it.width || medianSize
        const ih = it.height || medianSize
        const newX = Math.min(x, ix)
        const newY = Math.min(y, iy)
        width  = Math.max(x + width,  ix + iw) - newX
        height = Math.max(y + height, iy + ih) - newY
        x = newX
        y = newY
        capturedItemSet.add(it)
      }
      mathRegions.push({ x, y, width, height })
    } else {
      // Inline math: keep original region, only math items excluded from text
      mathRegions.push(region)
    }
  }

  return { mathRegions, capturedItemSet }
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

  // Detect math items, then build expanded formula regions.
  // Pass pageWidth so cross-column item absorption is avoided.
  const mathItems = items.filter(it => isMathItem(it, medianSize))
  const { mathRegions, capturedItemSet } = buildFormulaRegions(items, mathItems, medianSize, pageWidth)
  const textItems = items.filter(it => !capturedItemSet.has(it))

  // Detect layout
  const isTwoCol = detectTwoColumn(textItems, pageWidth)

  let paragraphs = []
  if (isTwoCol) {
    // Compute the y level where columns start BEFORE splitting by x.
    // Items above splitY are full-width (title, abstract, wide headings).
    // Items at or below splitY are column content.
    const splitY = detectColumnSplitY(textItems, pageWidth)
    const fullWidthItems = textItems.filter(it => it.transform[5] > splitY + 10)
    const columnItems    = textItems.filter(it => it.transform[5] <= splitY + 10)

    const { left, right } = splitColumns(columnItems, pageWidth)
    const leftLines  = groupIntoLines(left)
    const rightLines = groupIntoLines(right)
    const leftParas  = groupIntoParagraphs(leftLines, medianSize)
    const rightParas = groupIntoParagraphs(rightLines, medianSize)
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
 * Above this y, content is full-width (title, abstract, etc.).
 *
 * Strategy: right-column text items have their x start in a narrow band just
 * past the page centre — [midX + 3%, midX + 20%].  Full-width centred text
 * never starts there.  The highest such item's y is where columns begin.
 */
function detectColumnSplitY(items, pageWidth) {
  const midX = pageWidth / 2
  const lo = midX + pageWidth * 0.03   // 3 % past centre
  const hi = midX + pageWidth * 0.20   // 20 % past centre

  const rightColItems = items.filter(it => {
    const x = it.transform[4]
    return x >= lo && x <= hi
  })

  if (rightColItems.length === 0) return 0
  return Math.max(...rightColItems.map(it => it.transform[5]))
}

/**
 * Return true only if this looks like an academic paper first page:
 * must have a heading-large paragraph AND an "Abstract" keyword.
 * Resumes, reports, and articles will not match.
 */
function looksLikeAcademicPaper(paragraphs) {
  const hasLargeTitle = paragraphs.some(p => p.type === 'heading-large')
  if (!hasLargeTitle) return false
  // Match standalone "Abstract" heading OR any inline "Abstract text/Abstract: text/..." pattern
  return paragraphs.some(p => p.text && (
    isAbstractHeading(p.text) ||
    INLINE_ABSTRACT_RE.test(p.text)
  ))
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
    // List blocks have no .text — route them straight through
    if (para.type === 'list') {
      if (state === 'body') blocks.push(paragraphToBlock(para))
      continue
    }

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
      // Inline abstract: "Abstract text...", "Abstract: text...", "Abstract— text..."
      const inlineAbstractMatch = text.match(INLINE_ABSTRACT_RE)
      if (inlineAbstractMatch) {
        if (authorNames.length > 0) {
          blocks.push({ type: 'authors', names: authorNames })
          authorNames = []
        }
        abstractLines.push(inlineAbstractMatch[1].trim())
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
      // Also exit on numbered section headings even when classified as body
      // (e.g. "1 Introduction", "I. Introduction", "1. Introduction").
      // No length cap: the heading may be merged with the first body paragraph.
      if (/^(\d+\.?\s+[A-Z]|[IVX]+\.\s+[A-Z])/.test(text)) {
        if (abstractLines.length > 0) {
          blocks.push({ type: 'abstract', text: abstractLines.join(' ') })
          abstractLines = []
        }
        state = 'body'
        blocks.push(paragraphToBlock(para))
        continue
      }
      // Collect abstract lines; drop the length > 20 gate so short last lines aren't lost
      if (text.length > 3) abstractLines.push(text)
      continue
    }

    if (state === 'body') {
      // Late abstract detection: handles papers with dates/other content between
      // authors and abstract, causing premature exit from 'authors' state.
      // Only re-enter abstract if we haven't collected any abstract content yet.
      if (abstractLines.length === 0) {
        if (isAbstractHeading(text)) {
          state = 'abstract'
          continue
        }
        const inlineMatch = text.match(INLINE_ABSTRACT_RE)
        if (inlineMatch) {
          abstractLines.push(inlineMatch[1].trim())
          state = 'abstract'
          continue
        }
      }
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
