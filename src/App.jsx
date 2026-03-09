import { useState, useCallback } from 'react'
import UploadScreen from './components/UploadScreen.jsx'
import ProcessingScreen from './components/ProcessingScreen.jsx'
import ReadingScreen from './components/ReadingScreen.jsx'
import { useReadingSettings } from './hooks/useReadingSettings.js'
import { useDocumentCache } from './hooks/useDocumentCache.js'
import { extractPDF } from './lib/pdfExtractor.js'

export default function App() {
  const [view, setView] = useState('upload') // 'upload' | 'processing' | 'reading'
  const [document, setDocument] = useState(null)
  const [progress, setProgress] = useState({ current: 0, total: 0, blocks: [] })
  const [parseError, setParseError] = useState(null)

  const { settings, updateSetting } = useReadingSettings()
  const { recentDocs, saveDocument, getDocument } = useDocumentCache()

  const themeClass = `theme-${settings.theme}`
  const fontClass  = `font-size-${settings.fontSize}`
  const widthClass = `content-width-${settings.width}`

  const processFile = useCallback(async (file) => {
    setView('processing')
    setParseError(null)
    setProgress({ current: 0, total: 0, blocks: [] })

    try {
      const result = await extractPDF(file, (current, total, newBlocks) => {
        setProgress(prev => ({
          current,
          total,
          blocks: [...prev.blocks, ...newBlocks]
        }))
      })

      if (result) {
        await saveDocument(result)
        setDocument(result)
        setView('reading')
      }
    } catch (err) {
      console.error('PDF extraction failed:', err)
      setParseError(err.message || 'Failed to parse PDF')
      setView('upload')
    }
  }, [saveDocument])

  const handleFileSelect = useCallback((file) => {
    processFile(file)
  }, [processFile])

  const handleOpenRecent = useCallback(async (doc) => {
    setDocument(doc)
    setView('reading')
  }, [])

  const handleBack = useCallback(() => {
    setView('upload')
    setDocument(null)
  }, [])

  // Handle PWA file handling (Web App File Handling API)
  if ('launchQueue' in window) {
    window.launchQueue.setConsumer(async (launchParams) => {
      if (launchParams.files && launchParams.files.length > 0) {
        const fileHandle = launchParams.files[0]
        const file = await fileHandle.getFile()
        processFile(file)
      }
    })
  }

  return (
    <div
      className={`min-h-screen ${themeClass} ${fontClass} ${widthClass}`}
      style={{ backgroundColor: 'var(--color-bg)', color: 'var(--color-text)' }}
    >
      {view === 'upload' && (
        <UploadScreen
          onFileSelect={handleFileSelect}
          recentDocs={recentDocs}
          onOpenDoc={handleOpenRecent}
          error={parseError}
        />
      )}

      {view === 'processing' && (
        <ProcessingScreen progress={progress} />
      )}

      {view === 'reading' && document && (
        <ReadingScreen
          document={document}
          settings={settings}
          onUpdateSetting={updateSetting}
          onBack={handleBack}
        />
      )}
    </div>
  )
}
