import { useEffect, useRef } from 'react'

/**
 * Table of Contents drawer.
 * Extracts headings from content blocks and renders a scrollable list.
 * Clicking a heading scrolls to the corresponding section in the reading view.
 */
export default function TOCDrawer({ blocks, onClose, scrollContainerRef }) {
  const drawerRef = useRef(null)

  const headings = blocks
    .map((b, i) => ({ ...b, index: i }))
    .filter(b => b.type === 'heading' || b.type === 'title')

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  function handleHeadingClick(heading) {
    // Find the DOM element for this block
    const el = document.getElementById(`block-${heading.index}`)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
    onClose()
  }

  return (
    <>
      <div
        className="fixed inset-0 z-40"
        style={{ background: 'rgba(0,0,0,0.3)' }}
        onClick={onClose}
      />
      <div
        ref={drawerRef}
        className="fixed top-0 left-0 bottom-0 z-50 overflow-y-auto"
        style={{
          width: 'min(320px, 85vw)',
          background: 'var(--color-bg)',
          boxShadow: '4px 0 24px rgba(0,0,0,0.18)',
          padding: '1.5rem 0'
        }}
      >
        <div className="flex items-center justify-between px-5 mb-4">
          <h2
            className="font-sans font-semibold"
            style={{ fontSize: '1rem', color: 'var(--color-text)' }}
          >
            Contents
          </h2>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-secondary)' }}
          >
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {headings.length === 0 ? (
          <p
            className="px-5 font-sans"
            style={{ color: 'var(--color-text-secondary)', fontSize: '0.9rem' }}
          >
            No headings found
          </p>
        ) : (
          <nav>
            {headings.map((h) => (
              <button
                key={h.index}
                onClick={() => handleHeadingClick(h)}
                className="w-full text-left px-5 py-2 font-sans transition-colors"
                style={{
                  paddingLeft: h.type === 'title' ? '1.25rem' : h.level === 1 ? '1.25rem' : '2rem',
                  fontSize: h.type === 'title' || h.level === 1 ? '0.92rem' : '0.84rem',
                  fontWeight: h.type === 'title' || h.level === 1 ? '600' : '400',
                  color: 'var(--color-text)',
                  borderBottom: 'none',
                  background: 'none',
                  cursor: 'pointer',
                  borderLeft: h.type === 'title' ? '3px solid var(--color-accent)' : 'none'
                }}
              >
                {h.text}
              </button>
            ))}
          </nav>
        )}
      </div>
    </>
  )
}
