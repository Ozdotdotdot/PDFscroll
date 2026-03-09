import { useState, useCallback, useEffect } from 'react'

const STORAGE_KEY = 'pdf-reader-settings'

const DEFAULTS = {
  theme: 'light',     // 'light' | 'sepia' | 'dark'
  fontSize: 'medium', // 'small' | 'medium' | 'large' | 'xl'
  width: 'normal',    // 'compact' | 'normal' | 'wide'
  showImages: true,
  showFormulas: true
}

function loadSettings() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored ? { ...DEFAULTS, ...JSON.parse(stored) } : { ...DEFAULTS }
  } catch {
    return { ...DEFAULTS }
  }
}

export function useReadingSettings() {
  const [settings, setSettings] = useState(loadSettings)

  // Sync theme-color meta tag for PWA
  useEffect(() => {
    const meta = document.getElementById('theme-color-meta')
    if (meta) {
      meta.content = settings.theme === 'dark' ? '#181818'
                   : settings.theme === 'sepia' ? '#faf7f0'
                   : '#ffffff'
    }
  }, [settings.theme])

  const updateSetting = useCallback((key, value) => {
    setSettings(prev => {
      const next = { ...prev, [key]: value }
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)) } catch {}
      return next
    })
  }, [])

  return { settings, updateSetting }
}
