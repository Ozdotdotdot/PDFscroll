import { useState, useRef, useCallback, useEffect } from 'react'
import ProgressBar from './ProgressBar.jsx'
import SettingsPanel from './SettingsPanel.jsx'
import TOCDrawer from './TOCDrawer.jsx'
import Lightbox from './Lightbox.jsx'
import TitleBlock from './ContentBlocks/TitleBlock.jsx'
import AuthorList from './ContentBlocks/AuthorList.jsx'
import Abstract from './ContentBlocks/Abstract.jsx'
import SectionHeading from './ContentBlocks/SectionHeading.jsx'
import BodyText from './ContentBlocks/BodyText.jsx'
import FormulaBlock from './ContentBlocks/FormulaBlock.jsx'
import FigureBlock from './ContentBlocks/FigureBlock.jsx'
import TableBlock from './ContentBlocks/TableBlock.jsx'
import ListBlock from './ContentBlocks/ListBlock.jsx'

function minuteRead(wordCount) {
  const mins = Math.max(1, Math.ceil(wordCount / 200))
  return `${mins} min read`
}

export default function ReadingScreen({ document, settings, onUpdateSetting, onBack }) {
  const [showSettings, setShowSettings] = useState(false)
  const [showTOC,      setShowTOC]      = useState(false)
  const [lightbox,     setLightbox]     = useState(null) // { src, caption }
  const [toolbarVisible, setToolbarVisible] = useState(true)

  const scrollRef     = useRef(null)
  const lastScrollY   = useRef(0)
  const scrollTimerRef = useRef(null)

  const blocks = document.content || []

  // ── Toolbar hide/show on scroll ──────────────────────────────────────
  useEffect(() => {
    const container = scrollRef.current
    if (!container) return

    function onScroll() {
      const y = container.scrollTop
      const dy = y - lastScrollY.current

      if (dy > 8) {
        setToolbarVisible(false)
      } else if (dy < -8) {
        setToolbarVisible(true)
      }
      lastScrollY.current = y

      // Always show toolbar when near the bottom
      const nearBottom = container.scrollHeight - y - container.clientHeight < 60
      if (nearBottom) setToolbarVisible(true)
    }

    container.addEventListener('scroll', onScroll, { passive: true })
    return () => container.removeEventListener('scroll', onScroll)
  }, [])

  // ── Restore scroll position ──────────────────────────────────────────
  useEffect(() => {
    const container = scrollRef.current
    if (!container) return
    const saved = parseFloat(localStorage.getItem(`pdf-scroll-${document.fileHash}`) || '0')
    if (saved > 0) {
      container.scrollTop = saved
    }
  }, [document.fileHash])

  // ── Save scroll position periodically ───────────────────────────────
  useEffect(() => {
    const container = scrollRef.current
    if (!container) return

    function saveScroll() {
      try {
        localStorage.setItem(`pdf-scroll-${document.fileHash}`, String(container.scrollTop))
      } catch {}
    }

    function onScroll() {
      clearTimeout(scrollTimerRef.current)
      scrollTimerRef.current = setTimeout(saveScroll, 800)
    }

    container.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      container.removeEventListener('scroll', onScroll)
      clearTimeout(scrollTimerRef.current)
      saveScroll()
    }
  }, [document.fileHash])

  const openLightbox = useCallback((src, caption) => {
    setLightbox({ src, caption })
  }, [])

  const closeLightbox = useCallback(() => setLightbox(null), [])

  return (
    <div className="fixed inset-0 flex flex-col" style={{ background: 'var(--color-bg)' }}>
      {/* Reading progress bar */}
      <ProgressBar scrollContainerRef={scrollRef} />

      {/* Scrollable content */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto"
        style={{ paddingTop: 8, paddingBottom: 100 }}
      >
        <article className="content-area py-8">
          {/* Reading time badge */}
          {document.wordCount > 0 && (
            <div
              className="font-sans mb-6 flex items-center gap-2"
              style={{ color: 'var(--color-text-secondary)', fontSize: '0.82rem' }}
            >
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"/>
                <polyline points="12 6 12 12 16 14"/>
              </svg>
              {minuteRead(document.wordCount)} · {document.pageCount} pages
            </div>
          )}

          {/* Content blocks */}
          {blocks.map((block, i) => (
            <div id={`block-${i}`} key={i}>
              <ContentBlock
                block={block}
                settings={settings}
                onImageClick={openLightbox}
              />
            </div>
          ))}

          {blocks.length === 0 && (
            <div
              className="text-center font-sans py-20"
              style={{ color: 'var(--color-text-secondary)' }}
            >
              <p style={{ fontSize: '1.1rem' }}>No readable content found</p>
              <p style={{ fontSize: '0.85rem', marginTop: 8 }}>
                This PDF may be a scanned image. OCR support is coming in a future version.
              </p>
            </div>
          )}
        </article>
      </div>

      {/* Floating bottom toolbar */}
      <div
        className="fixed bottom-0 left-0 right-0 z-30 safe-bottom toolbar-transition"
        style={{
          transform: toolbarVisible ? 'translateY(0)' : 'translateY(110%)'
        }}
      >
        <div
          className="mx-auto font-sans"
          style={{ maxWidth: 'min(480px, 100%)', padding: '0 1rem 0.75rem' }}
        >
          <div
            className="flex items-center justify-between px-4 py-2.5 rounded-2xl"
            style={{
              background: 'var(--color-bg)',
              boxShadow: '0 4px 24px rgba(0,0,0,0.14), 0 1px 4px rgba(0,0,0,0.08)',
              border: '1px solid var(--color-border)'
            }}
          >
            {/* Back */}
            <ToolbarBtn onClick={onBack} title="Back to library">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="19" y1="12" x2="5" y2="12"/>
                <polyline points="12 19 5 12 12 5"/>
              </svg>
            </ToolbarBtn>

            {/* TOC */}
            <ToolbarBtn onClick={() => setShowTOC(v => !v)} title="Table of contents">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="8"  y1="6"  x2="21" y2="6"/>
                <line x1="8"  y1="12" x2="21" y2="12"/>
                <line x1="8"  y1="18" x2="21" y2="18"/>
                <line x1="3"  y1="6"  x2="3.01" y2="6"/>
                <line x1="3"  y1="12" x2="3.01" y2="12"/>
                <line x1="3"  y1="18" x2="3.01" y2="18"/>
              </svg>
            </ToolbarBtn>

            {/* Doc title (center) */}
            <span
              className="flex-1 text-center truncate mx-2"
              style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}
            >
              {document.title}
            </span>

            {/* Settings */}
            <ToolbarBtn onClick={() => setShowSettings(v => !v)} title="Settings">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="3"/>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
              </svg>
            </ToolbarBtn>
          </div>
        </div>
      </div>

      {/* Overlays */}
      {showSettings && (
        <SettingsPanel
          settings={settings}
          onUpdateSetting={onUpdateSetting}
          onClose={() => setShowSettings(false)}
        />
      )}

      {showTOC && (
        <TOCDrawer
          blocks={blocks}
          onClose={() => setShowTOC(false)}
          scrollContainerRef={scrollRef}
        />
      )}

      {lightbox && (
        <Lightbox
          src={lightbox.src}
          caption={lightbox.caption}
          onClose={closeLightbox}
        />
      )}
    </div>
  )
}

function ToolbarBtn({ onClick, title, children }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="flex items-center justify-center w-9 h-9 rounded-xl transition-colors"
      style={{
        color: 'var(--color-text)',
        background: 'none',
        border: 'none',
        cursor: 'pointer'
      }}
    >
      {children}
    </button>
  )
}

function ContentBlock({ block, settings, onImageClick }) {
  switch (block.type) {
    case 'title':
      return <TitleBlock text={block.text} />

    case 'authors':
      return <AuthorList names={block.names} />

    case 'abstract':
      return <Abstract text={block.text} />

    case 'abstract-label':
      return null // Handled inside Abstract

    case 'heading':
      return <SectionHeading level={block.level} text={block.text} />

    case 'list':
      return <ListBlock listType={block.listType} items={block.items} />

    case 'paragraph':
      return <BodyText text={block.text} />

    case 'caption':
      return <BodyText text={block.text} type="caption" />

    case 'figure':
      if (!settings.showImages) return null
      return <FigureBlock src={block.src} caption={block.caption} onImageClick={onImageClick} />

    case 'formula':
      if (!settings.showFormulas) return null
      return <FormulaBlock src={block.src} inline={block.inline} />

    case 'table':
      return <TableBlock headers={block.headers} rows={block.rows} />

    default:
      return null
  }
}
