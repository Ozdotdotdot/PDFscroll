/**
 * Formula / math region detection.
 * Detects text items that are likely mathematical content and groups them
 * into regions that should be rendered as canvas crops.
 */

// Unicode ranges for mathematical characters
const MATH_CHARS = new Set([
  // Greek letters
  ...Array.from({ length: 0x3C9 - 0x391 + 1 }, (_, i) =>
    String.fromCodePoint(0x391 + i)
  ),
  // Math operators
  '∑', '∫', '∂', '∇', '∆', '∏', '√', '∞', '≈', '≠', '≤', '≥',
  '±', '×', '÷', '·', '⊕', '⊗', '∈', '∉', '⊂', '⊃', '∩', '∪',
  '→', '←', '↔', '⇒', '⇔', '∀', '∃', '¬', '∧', '∨',
  // Superscript / subscript digits
  '⁰','¹','²','³','⁴','⁵','⁶','⁷','⁸','⁹',
  '₀','₁','₂','₃','₄','₅','₆','₇','₈','₉',
])

const MATH_CHAR_REGEX = /[∑∫∂∇∆∏√∞≈≠≤≥±×÷·⊕⊗∈∉⊂⊃∩∪→←↔⇒⇔∀∃¬∧∨α-ωΑ-Ω⁰-⁹₀-₉]/u

/**
 * Compute what fraction of a string's characters are mathematical.
 */
function mathDensity(str) {
  if (!str || str.length === 0) return 0
  let count = 0
  for (const ch of str) {
    if (MATH_CHAR_REGEX.test(ch)) count++
  }
  return count / str.length
}

// Regex to detect LaTeX/TeX math font names in PDF font descriptors.
// CMMI = Computer Modern Math Italic, CMSY = Math Symbols, MSAM/MSBM = AMS fonts,
// CMEX = Math Extension, EUFM = Euler Fraktur, RSFS/RSFSO = Script fonts.
const MATH_FONT_RE = /cmmi|cmsy|cmex|msam|msbm|eufm|eurm|rsfs|mathit|mathbf|mathsf|symbol/i

/**
 * Decide whether a text item is likely part of a mathematical formula.
 */
export function isMathItem(item, medianFontSize) {
  const str = item.str.trim()
  if (!str) return false

  // High density of math characters
  if (mathDensity(str) > 0.4) return true

  // Very short strings with individual math symbols
  if (str.length <= 3 && mathDensity(str) > 0) return true

  // Subscripts / superscripts (much smaller than body text)
  const size = item.height || Math.abs(item.transform[3]) || Math.abs(item.transform[0])
  if (size < medianFontSize * 0.65 && /^[a-zA-Z0-9,.]$/.test(str)) return true

  // LaTeX math fonts identified by PDF font name
  if (item.fontName && MATH_FONT_RE.test(item.fontName)) return true

  return false
}

/**
 * Group math items into contiguous bounding-box regions.
 * Items are in PDF user space (y increases upward).
 * Returns an array of { x, y, width, height } objects (PDF user space).
 */
export function groupMathRegions(mathItems, pageFontSize) {
  if (mathItems.length === 0) return []

  // Sort by position for clustering
  const sorted = [...mathItems].sort((a, b) => {
    const dy = b.transform[5] - a.transform[5]
    return Math.abs(dy) > pageFontSize ? dy : a.transform[4] - b.transform[4]
  })

  const regions = []
  const proximity = pageFontSize * 4 // cluster items within 4em of each other

  for (const item of sorted) {
    const ix = item.transform[4]
    const iy = item.transform[5]
    const iw = item.width || pageFontSize
    const ih = item.height || pageFontSize

    // Try to merge into an existing region
    let merged = false
    for (const region of regions) {
      const dx = Math.max(0, ix - (region.x + region.width), region.x - (ix + iw))
      const dy = Math.max(0, iy - (region.y + region.height), region.y - (iy + ih))
      if (dx < proximity && dy < proximity) {
        // Expand region
        const newX = Math.min(region.x, ix)
        const newY = Math.min(region.y, iy)
        region.width  = Math.max(region.x + region.width,  ix + iw) - newX
        region.height = Math.max(region.y + region.height, iy + ih) - newY
        region.x = newX
        region.y = newY
        merged = true
        break
      }
    }

    if (!merged) {
      regions.push({ x: ix, y: iy, width: Math.max(iw, pageFontSize), height: Math.max(ih, pageFontSize) })
    }
  }

  // Filter out tiny regions (likely false positives)
  return regions.filter(r => r.width > pageFontSize && r.height > pageFontSize * 0.5)
}
