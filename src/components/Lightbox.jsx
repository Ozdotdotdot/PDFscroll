import { useState, useRef, useEffect, useCallback } from 'react'

export default function Lightbox({ src, caption, onClose }) {
  const [scale, setScale] = useState(1)
  const [rotation, setRotation] = useState(0)
  const [translate, setTranslate] = useState({ x: 0, y: 0 })
  const lastTouchDist = useRef(null)
  const lastTouchPos  = useRef(null)
  const pointers      = useRef(new Map())
  const dragStart     = useRef(null)

  // Keyboard dismiss
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Prevent body scroll while lightbox is open
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  // ── Pointer events for pinch-zoom and pan ──────────────────────────────
  const onPointerDown = useCallback((e) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })

    if (pointers.current.size === 1) {
      dragStart.current = { x: e.clientX, y: e.clientY, tx: translate.x, ty: translate.y }
    }
  }, [translate])

  const onPointerMove = useCallback((e) => {
    if (!pointers.current.has(e.pointerId)) return
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })

    const pts = [...pointers.current.values()]

    if (pts.length === 2) {
      // Pinch zoom
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y)
      if (lastTouchDist.current !== null) {
        const delta = dist / lastTouchDist.current
        setScale(s => Math.min(Math.max(s * delta, 0.5), 8))
      }
      lastTouchDist.current = dist
      dragStart.current = null
    } else if (pts.length === 1 && dragStart.current && scale > 1) {
      // Pan when zoomed
      const dx = e.clientX - dragStart.current.x
      const dy = e.clientY - dragStart.current.y
      setTranslate({ x: dragStart.current.tx + dx, y: dragStart.current.ty + dy })
    }
  }, [scale])

  const onPointerUp = useCallback((e) => {
    pointers.current.delete(e.pointerId)
    if (pointers.current.size < 2) {
      lastTouchDist.current = null
    }
    // Swipe-down to close (single finger, no zoom, swift downward motion)
    if (pointers.current.size === 0 && dragStart.current && scale <= 1) {
      const dy = e.clientY - dragStart.current.y
      if (dy > 90) onClose()
    }
  }, [scale, onClose])

  const handleBgClick = useCallback((e) => {
    if (e.target === e.currentTarget) onClose()
  }, [onClose])

  const handleRotate = useCallback(() => {
    setRotation(r => (r + 90) % 360)
  }, [])

  const handleDoubleTap = useCallback(() => {
    if (scale > 1) {
      setScale(1)
      setTranslate({ x: 0, y: 0 })
    } else {
      setScale(2.5)
    }
  }, [scale])

  const handleDownload = useCallback(() => {
    const a = document.createElement('a')
    a.href = src
    a.download = caption || 'figure.jpg'
    a.click()
  }, [src, caption])

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.92)' }}
      onClick={handleBgClick}
    >
      {/* Image */}
      <div
        className="relative select-none"
        style={{
          transform: `translate(${translate.x}px, ${translate.y}px) scale(${scale}) rotate(${rotation}deg)`,
          transformOrigin: 'center center',
          transition: scale === 1 && rotation % 360 === 0 ? 'transform 0.2s ease' : 'none',
          touchAction: 'none',
          cursor: scale > 1 ? 'grab' : 'default'
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onDoubleClick={handleDoubleTap}
      >
        <img
          src={src}
          alt={caption || 'Figure'}
          draggable={false}
          style={{
            maxWidth:  '90vw',
            maxHeight: '80vh',
            objectFit: 'contain',
            display:   'block',
            userSelect: 'none',
            pointerEvents: 'none'
          }}
        />
      </div>

      {/* Caption */}
      {caption && (
        <div
          className="absolute bottom-20 left-0 right-0 text-center px-6 font-sans"
          style={{ color: 'rgba(255,255,255,0.75)', fontSize: '0.85rem' }}
        >
          {caption}
        </div>
      )}

      {/* Controls */}
      <div className="absolute top-4 right-4 flex gap-2">
        <ControlBtn onClick={handleRotate} title="Rotate 90°">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="1 4 1 10 7 10"/>
            <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>
          </svg>
        </ControlBtn>
        <ControlBtn onClick={handleDownload} title="Download">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
        </ControlBtn>
        <ControlBtn onClick={onClose} title="Close">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </ControlBtn>
      </div>

      {/* Zoom reset */}
      {scale !== 1 && (
        <button
          className="absolute bottom-4 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full font-sans text-xs"
          style={{ background: 'rgba(255,255,255,0.15)', color: 'white' }}
          onClick={() => { setScale(1); setTranslate({ x: 0, y: 0 }) }}
        >
          Reset zoom
        </button>
      )}
    </div>
  )
}

function ControlBtn({ onClick, title, children }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="flex items-center justify-center w-9 h-9 rounded-full"
      style={{ background: 'rgba(255,255,255,0.15)', color: 'white', border: 'none', cursor: 'pointer' }}
    >
      {children}
    </button>
  )
}
