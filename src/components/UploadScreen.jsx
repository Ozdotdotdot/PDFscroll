import { useState, useRef, useCallback } from 'react'

function formatDate(ts) {
  const d = new Date(ts)
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function minuteRead(wordCount) {
  const mins = Math.max(1, Math.ceil(wordCount / 200))
  return `${mins} min read`
}

export default function UploadScreen({ onFileSelect, recentDocs, onOpenDoc, error }) {
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef(null)

  const handleFile = useCallback((file) => {
    if (!file) return
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      alert('Please select a PDF file.')
      return
    }
    onFileSelect(file)
  }, [onFileSelect])

  const onInputChange = (e) => {
    handleFile(e.target.files?.[0])
    e.target.value = ''
  }

  const onDragOver = (e) => { e.preventDefault(); setIsDragging(true) }
  const onDragLeave = () => setIsDragging(false)
  const onDrop = (e) => {
    e.preventDefault()
    setIsDragging(false)
    handleFile(e.dataTransfer.files?.[0])
  }

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-start px-4 pt-16 pb-12"
      style={{ background: 'var(--color-bg)' }}
    >
      {/* Logo / wordmark */}
      <div className="mb-10 text-center">
        <div
          className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-3"
          style={{ background: 'var(--color-accent)' }}
        >
          <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="white" strokeWidth="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
            <line x1="16" y1="13" x2="8" y2="13"/>
            <line x1="16" y1="17" x2="8" y2="17"/>
            <line x1="10" y1="9"  x2="8" y2="9"/>
          </svg>
        </div>
        <h1
          className="font-sans font-bold"
          style={{ fontSize: '1.5rem', color: 'var(--color-text)', letterSpacing: '-0.03em' }}
        >
          PDF Reader
        </h1>
        <p
          className="font-sans mt-1"
          style={{ fontSize: '0.9rem', color: 'var(--color-text-secondary)' }}
        >
          Beautiful reading, everywhere
        </p>
      </div>

      {/* Drop zone */}
      <div
        className={`w-full max-w-md rounded-2xl border-2 border-dashed flex flex-col items-center justify-center cursor-pointer transition-all select-none ${isDragging ? 'drop-active' : ''}`}
        style={{
          borderColor: isDragging ? 'var(--color-accent)' : 'var(--color-border)',
          background:   isDragging ? 'var(--color-surface)' : 'transparent',
          padding: '3rem 1.5rem',
          minHeight: 220
        }}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={() => fileInputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,application/pdf"
          className="sr-only"
          onChange={onInputChange}
        />

        <div
          className="w-14 h-14 rounded-full flex items-center justify-center mb-4"
          style={{ background: 'var(--color-surface2)' }}
        >
          <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="var(--color-accent)" strokeWidth="2">
            <polyline points="16 16 12 12 8 16"/>
            <line x1="12" y1="12" x2="12" y2="21"/>
            <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/>
          </svg>
        </div>

        <p
          className="font-sans font-semibold mb-1"
          style={{ fontSize: '1rem', color: 'var(--color-text)' }}
        >
          Open a PDF
        </p>
        <p
          className="font-sans text-center"
          style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', maxWidth: 240 }}
        >
          Tap to browse, or drag &amp; drop a PDF file here
        </p>
        <p
          className="font-sans mt-3 px-3 py-1.5 rounded-full font-medium"
          style={{
            fontSize: '0.82rem',
            background: 'var(--color-accent)',
            color: '#fff',
            cursor: 'pointer'
          }}
        >
          Choose file
        </p>
      </div>

      {/* Error message */}
      {error && (
        <div
          className="mt-4 w-full max-w-md px-4 py-3 rounded-xl font-sans text-sm"
          style={{
            background: '#fee2e2',
            color: '#991b1b',
            border: '1px solid #fca5a5'
          }}
        >
          ⚠️ {error}
        </div>
      )}

      {/* Privacy note */}
      <p
        className="font-sans mt-5 text-center"
        style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', maxWidth: 320 }}
      >
        🔒 Processed entirely on your device — no files uploaded to any server
      </p>

      {/* Recent documents */}
      {recentDocs && recentDocs.length > 0 && (
        <div className="w-full max-w-md mt-10">
          <h2
            className="font-sans font-semibold mb-3 uppercase tracking-wider"
            style={{ fontSize: '0.72rem', color: 'var(--color-text-secondary)' }}
          >
            Recent
          </h2>
          <div className="flex flex-col gap-2">
            {recentDocs.map(doc => (
              <button
                key={doc.id}
                onClick={() => onOpenDoc(doc)}
                className="w-full text-left flex items-center gap-3 px-4 py-3 rounded-xl transition-colors font-sans"
                style={{
                  background: 'var(--color-surface)',
                  border: '1px solid var(--color-border)',
                  cursor: 'pointer'
                }}
              >
                <div
                  className="flex-shrink-0 flex items-center justify-center w-9 h-9 rounded-lg"
                  style={{ background: 'var(--color-surface2)' }}
                >
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="var(--color-accent)" strokeWidth="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                    <polyline points="14 2 14 8 20 8"/>
                  </svg>
                </div>
                <div className="min-w-0 flex-1">
                  <p
                    className="font-medium truncate"
                    style={{ fontSize: '0.9rem', color: 'var(--color-text)' }}
                  >
                    {doc.title}
                  </p>
                  <p
                    className="truncate mt-0.5"
                    style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}
                  >
                    {doc.pageCount} pages · {minuteRead(doc.wordCount)} · {formatDate(doc.openedAt)}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
