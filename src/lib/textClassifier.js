/**
 * Text classification and grouping utilities.
 * Classifies PDF text items into semantic block types based on font-size heuristics.
 */

/** Compute the median of an array of numbers */
export function median(arr) {
  if (arr.length === 0) return 12
  const sorted = [...arr].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid]
}

/**
 * Classify a single text item given the document's median font size.
 * Returns: 'heading-large' | 'heading-small' | 'body' | 'caption' | 'footnote'
 */
export function classifyItem(item, medianSize) {
  const size = getItemFontSize(item)
  if (size <= 0) return 'body'
  if (size > medianSize * 1.8) return 'heading-large'
  if (size > medianSize * 1.3) return 'heading-small'
  if (size < medianSize * 0.8) return 'caption'
  return 'body'
}

/** Extract font size from a text item's transform */
export function getItemFontSize(item) {
  // item.transform = [scaleX, skewX, skewY, scaleY, tx, ty]
  // Font size is approximately the magnitude of the scale components
  if (item.height && item.height > 0) return item.height
  const [a, , , d] = item.transform
  return Math.abs(d) || Math.abs(a) || 0
}

/**
 * Detect if a page has a two-column layout.
 * Returns true if significant text clusters in both left and right halves.
 */
export function detectTwoColumn(items, pageWidth) {
  if (items.length < 15) return false
  const midX = pageWidth / 2
  const leftCount  = items.filter(it => it.transform[4] + it.width / 2 < midX - 20).length
  const rightCount = items.filter(it => it.transform[4] > midX + 20).length
  const ratio = Math.min(leftCount, rightCount) / items.length
  return ratio > 0.25
}

/**
 * Determine whether a text item is a page header/footer.
 * Strips items within `margin` PDF units of the top/bottom of the page.
 */
export function isHeaderFooter(item, pageHeight, margin = 45) {
  const y = item.transform[5]
  return y < margin || y > pageHeight - margin
}

/**
 * Group text items into lines (items sharing the same baseline ± tolerance).
 * Returns an array of line arrays, sorted top-to-bottom (descending PDF y).
 */
export function groupIntoLines(items) {
  if (items.length === 0) return []

  // Sort top-to-bottom (higher PDF y = higher on page = earlier in reading order)
  const sorted = [...items].sort((a, b) => {
    const dy = b.transform[5] - a.transform[5]
    if (Math.abs(dy) > 2) return dy
    return a.transform[4] - b.transform[4] // left to right within a line
  })

  const lines = []
  let currentLine = [sorted[0]]
  let currentY = sorted[0].transform[5]

  for (let i = 1; i < sorted.length; i++) {
    const item = sorted[i]
    const y = item.transform[5]
    const tolerance = Math.max(getItemFontSize(item) * 0.6, 3)

    if (Math.abs(y - currentY) <= tolerance) {
      currentLine.push(item)
    } else {
      lines.push(currentLine)
      currentLine = [item]
      currentY = y
    }
  }
  if (currentLine.length > 0) lines.push(currentLine)
  return lines
}

/**
 * Merge a line of text items into a single string, inserting spaces where needed.
 */
export function lineToText(line) {
  const sorted = [...line].sort((a, b) => a.transform[4] - b.transform[4])
  let text = ''
  for (let i = 0; i < sorted.length; i++) {
    const item = sorted[i]
    if (i > 0) {
      const prev = sorted[i - 1]
      const gap = item.transform[4] - (prev.transform[4] + prev.width)
      // Insert space if gap is more than ~1/3 of a character width
      const charWidth = prev.width / (prev.str.length || 1)
      if (gap > charWidth * 0.3 && !text.endsWith(' ') && !item.str.startsWith(' ')) {
        text += ' '
      }
    }
    text += item.str
  }
  return text.trim()
}

/**
 * Group lines into paragraphs based on vertical gaps between lines.
 * Returns an array of { text, type, avgFontSize, x, y } objects.
 */
export function groupIntoParagraphs(lines, medianSize) {
  if (lines.length === 0) return []

  const paragraphs = []
  let currentLines = [lines[0]]

  // Compute typical line spacing
  const lineSpacings = []
  for (let i = 1; i < lines.length; i++) {
    const prevY = lines[i - 1][0].transform[5]
    const currY = lines[i][0].transform[5]
    const gap = prevY - currY // positive = going down the page
    if (gap > 0 && gap < 50) lineSpacings.push(gap)
  }
  const typicalSpacing = median(lineSpacings) || medianSize * 1.5
  const paragraphBreakThreshold = typicalSpacing * 1.6

  for (let i = 1; i < lines.length; i++) {
    const prevY = lines[i - 1][0].transform[5]
    const currY = lines[i][0].transform[5]
    const gap = prevY - currY

    if (gap > paragraphBreakThreshold) {
      // Paragraph break
      paragraphs.push(buildParagraph(currentLines, medianSize))
      currentLines = []
    }
    currentLines.push(lines[i])
  }
  if (currentLines.length > 0) {
    paragraphs.push(buildParagraph(currentLines, medianSize))
  }

  return paragraphs
}

function buildParagraph(lines, medianSize) {
  const text = lines.map(lineToText).filter(Boolean).join(' ')
  const firstItem = lines[0][0]
  const sizes = lines.flatMap(l => l.map(it => getItemFontSize(it))).filter(s => s > 0)
  const avgSize = sizes.length ? sizes.reduce((a, b) => a + b, 0) / sizes.length : medianSize
  const x = Math.min(...lines.map(l => Math.min(...l.map(it => it.transform[4]))))
  const y = lines[0][0].transform[5] // top y (highest PDF y = top of page)

  let type = 'body'
  if (avgSize > medianSize * 1.8) type = 'heading-large'
  else if (avgSize > medianSize * 1.3) type = 'heading-small'
  else if (avgSize < medianSize * 0.8) type = 'caption'

  return { text, type, avgFontSize: avgSize, x, y, lineCount: lines.length }
}

/**
 * Separate items into left/right columns and return each sorted top-to-bottom.
 */
export function splitColumns(items, pageWidth) {
  const midX = pageWidth / 2
  const left  = items.filter(it => it.transform[4] + it.width / 2 < midX)
  const right = items.filter(it => it.transform[4] + it.width / 2 >= midX)
  return { left, right }
}

/**
 * Heuristic: is this text in the "abstract" section?
 * Looks for the word "Abstract" appearing as a heading.
 */
export function isAbstractHeading(text) {
  return /^abstract\s*$/i.test(text.trim())
}

/**
 * Detect probable author affiliation text (common patterns like superscripts,
 * institution names, email patterns).
 */
export function looksLikeAffiliation(text) {
  return /university|institute|department|lab |laboratory|@|\d{5}/i.test(text)
}

/**
 * Classify the first-page special elements: title, authors, abstract.
 * Returns the identified element type or null.
 */
export function classifyFirstPageElement(para, isFirstPage, foundTitle, foundAbstract) {
  if (!isFirstPage) return null
  if (!foundTitle && para.type === 'heading-large') return 'title'
  if (!foundAbstract && isAbstractHeading(para.text)) return 'abstract-label'
  return null
}
