/**
 * Image extraction from PDF pages using canvas rendering.
 * Tracks the current transformation matrix (CTM) through the operator list
 * to determine image positions, then crops them from a rendered canvas.
 */

import * as pdfjsLib from 'pdfjs-dist'

/**
 * Multiply two 2D affine transform matrices.
 * Both represented as [a, b, c, d, e, f] (canvas convention).
 * Returns current × newTransform (pre-multiply).
 */
function multiplyMatrix(current, m) {
  // current = [a0,b0,c0,d0,e0,f0], m = [a1,b1,c1,d1,e1,f1]
  const [a0, b0, c0, d0, e0, f0] = current
  const [a1, b1, c1, d1, e1, f1] = m
  return [
    a0 * a1 + c0 * b1,
    b0 * a1 + d0 * b1,
    a0 * c1 + c0 * d1,
    b0 * c1 + d0 * d1,
    a0 * e1 + c0 * f1 + e0,
    b0 * e1 + d0 * f1 + f0
  ]
}

/** Apply an affine transform [a,b,c,d,e,f] to a 2D point [x, y] */
function transformPoint(m, x, y) {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]
}

/**
 * Convert PDF user-space coordinates to canvas pixel coordinates
 * using the viewport transform.
 * viewportTransform = [a, b, c, d, e, f] (from page.getViewport())
 */
function pdfToCanvas(vt, x, y) {
  return [vt[0] * x + vt[2] * y + vt[4], vt[1] * x + vt[3] * y + vt[5]]
}

/**
 * Extract images from a single PDF page.
 * @param {PDFPageProxy} page - PDF.js page object
 * @param {number} scale - Render scale (e.g., 2 for high-DPI)
 * @returns {Promise<Array<{src: string, canvasY: number, width: number, height: number}>>}
 */
export async function extractPageImages(page, scale = 2) {
  const viewport = page.getViewport({ scale })
  const opList = await page.getOperatorList()

  const { OPS } = pdfjsLib

  // Track CTM (current transformation matrix) through the operator list
  const ctmStack = []
  let currentCTM = [1, 0, 0, 1, 0, 0] // identity
  const imageOps = []

  for (let i = 0; i < opList.fnArray.length; i++) {
    const fn = opList.fnArray[i]
    const args = opList.argsArray[i]

    if (fn === OPS.save) {
      ctmStack.push([...currentCTM])
    } else if (fn === OPS.restore) {
      if (ctmStack.length > 0) {
        currentCTM = ctmStack.pop()
      }
    } else if (fn === OPS.transform) {
      // args = [a, b, c, d, e, f]
      currentCTM = multiplyMatrix(currentCTM, args)
    } else if (
      fn === OPS.paintImageXObject ||
      fn === OPS.paintInlineImageXObject ||
      fn === OPS.paintImageMaskXObject
    ) {
      imageOps.push({ ctm: [...currentCTM] })
    }
  }

  if (imageOps.length === 0) return []

  // Render the full page to an off-screen canvas
  const canvas = document.createElement('canvas')
  canvas.width  = Math.floor(viewport.width)
  canvas.height = Math.floor(viewport.height)
  const ctx = canvas.getContext('2d')

  await page.render({ canvasContext: ctx, viewport }).promise

  const vt = viewport.transform // [sx, 0, 0, -sx, tx, ty] typically
  const images = []

  for (const { ctm } of imageOps) {
    // The image occupies a unit square [0,0]→[1,1] in image space.
    // The CTM maps image space → PDF user space.
    // Compute four corners in PDF user space:
    const corners = [
      transformPoint(ctm, 0, 0),
      transformPoint(ctm, 1, 0),
      transformPoint(ctm, 0, 1),
      transformPoint(ctm, 1, 1)
    ]

    // Convert each corner to canvas coordinates
    const canvasCorners = corners.map(([px, py]) => pdfToCanvas(vt, px, py))

    const xs = canvasCorners.map(c => c[0])
    const ys = canvasCorners.map(c => c[1])
    const minX = Math.floor(Math.min(...xs))
    const minY = Math.floor(Math.min(...ys))
    const maxX = Math.ceil(Math.max(...xs))
    const maxY = Math.ceil(Math.max(...ys))

    const w = maxX - minX
    const h = maxY - minY

    // Skip tiny / decorative images
    if (w < 24 || h < 24) continue
    // Skip images that are clearly page-wide thin rules (decorative lines)
    if (h < 6) continue
    // Skip images larger than the page (background fills)
    if (w >= canvas.width * 0.99 && h >= canvas.height * 0.99) continue

    // Crop from the rendered canvas
    const cropCanvas = document.createElement('canvas')
    cropCanvas.width  = w
    cropCanvas.height = h
    const cropCtx = cropCanvas.getContext('2d')
    cropCtx.drawImage(canvas, minX, minY, w, h, 0, 0, w, h)

    const src = cropCanvas.toDataURL('image/jpeg', 0.88)
    images.push({ src, canvasY: minY, width: w, height: h })
  }

  return images
}

/**
 * Convert a PDF bounding box (in PDF user space) to canvas coordinates.
 * Useful for formula region cropping.
 * @param {PDFPageProxy} page
 * @param {{x, y, width, height}} pdfBox - in PDF user space (y from bottom)
 * @param {number} scale
 * @returns {Promise<string|null>} data URL or null
 */
export async function cropRegionFromPage(page, pdfBox, scale = 2) {
  const viewport = page.getViewport({ scale })
  const vt = viewport.transform

  // Convert PDF box to canvas coords
  // PDF: y = bottom, height goes up; canvas: y = top, height goes down
  const [cx1, cy1] = pdfToCanvas(vt, pdfBox.x, pdfBox.y + pdfBox.height) // top-left in canvas
  const [cx2, cy2] = pdfToCanvas(vt, pdfBox.x + pdfBox.width, pdfBox.y)  // bottom-right in canvas

  const minX = Math.floor(Math.min(cx1, cx2)) - 8
  const minY = Math.floor(Math.min(cy1, cy2)) - 8
  const maxX = Math.ceil(Math.max(cx1, cx2)) + 8
  const maxY = Math.ceil(Math.max(cy1, cy2)) + 8

  const w = Math.max(maxX - minX, 1)
  const h = Math.max(maxY - minY, 1)

  if (w < 8 || h < 4) return null

  const canvas = document.createElement('canvas')
  canvas.width  = Math.floor(viewport.width)
  canvas.height = Math.floor(viewport.height)
  await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise

  const crop = document.createElement('canvas')
  crop.width  = w
  crop.height = h
  crop.getContext('2d').drawImage(canvas, minX, minY, w, h, 0, 0, w, h)

  return crop.toDataURL('image/png')
}
