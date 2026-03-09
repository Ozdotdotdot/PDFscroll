import { useEffect, useRef } from 'react'

export default function SettingsPanel({ settings, onUpdateSetting, onClose }) {
  const panelRef = useRef(null)

  // Dismiss on outside click
  useEffect(() => {
    function onPointerDown(e) {
      if (panelRef.current && !panelRef.current.contains(e.target)) onClose()
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [onClose])

  // Dismiss on Escape
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40"
        style={{ background: 'rgba(0,0,0,0.3)' }}
        onClick={onClose}
      />

      {/* Panel */}
      <div
        ref={panelRef}
        className="fixed bottom-0 left-0 right-0 z-50 rounded-t-2xl px-6 pt-5 pb-8 safe-bottom"
        style={{
          background: 'var(--color-bg)',
          boxShadow: '0 -4px 32px rgba(0,0,0,0.18)',
          maxWidth: '500px',
          margin: '0 auto'
        }}
      >
        {/* Handle */}
        <div
          className="mx-auto mb-4 rounded-full"
          style={{ width: 36, height: 4, background: 'var(--color-border)' }}
        />

        <h2
          className="font-sans font-semibold mb-5 text-center"
          style={{ fontSize: '1rem', color: 'var(--color-text)' }}
        >
          Reading Settings
        </h2>

        {/* Theme */}
        <SettingSection label="Theme">
          <OptionGroup
            options={[
              { value: 'light', label: '☀️ Light' },
              { value: 'sepia', label: '📜 Sepia' },
              { value: 'dark',  label: '🌙 Dark'  }
            ]}
            value={settings.theme}
            onChange={v => onUpdateSetting('theme', v)}
          />
        </SettingSection>

        {/* Font size */}
        <SettingSection label="Text Size">
          <OptionGroup
            options={[
              { value: 'small',  label: 'A',  style: { fontSize: '0.85rem' } },
              { value: 'medium', label: 'A',  style: { fontSize: '1rem'    } },
              { value: 'large',  label: 'A',  style: { fontSize: '1.15rem' } },
              { value: 'xl',     label: 'A',  style: { fontSize: '1.35rem' } }
            ]}
            value={settings.fontSize}
            onChange={v => onUpdateSetting('fontSize', v)}
          />
        </SettingSection>

        {/* Width */}
        <SettingSection label="Column Width">
          <OptionGroup
            options={[
              { value: 'compact', label: 'Compact' },
              { value: 'normal',  label: 'Normal'  },
              { value: 'wide',    label: 'Wide'    }
            ]}
            value={settings.width}
            onChange={v => onUpdateSetting('width', v)}
          />
        </SettingSection>

        {/* Toggles */}
        <SettingSection label="Content">
          <div className="flex flex-col gap-3">
            <Toggle
              label="Show Images"
              value={settings.showImages}
              onChange={v => onUpdateSetting('showImages', v)}
            />
            <Toggle
              label="Show Formulas"
              value={settings.showFormulas}
              onChange={v => onUpdateSetting('showFormulas', v)}
            />
          </div>
        </SettingSection>
      </div>
    </>
  )
}

function SettingSection({ label, children }) {
  return (
    <div className="mb-5">
      <p
        className="font-sans font-medium mb-2 uppercase tracking-wider"
        style={{ fontSize: '0.7rem', color: 'var(--color-text-secondary)' }}
      >
        {label}
      </p>
      {children}
    </div>
  )
}

function OptionGroup({ options, value, onChange }) {
  return (
    <div className="flex gap-2 flex-wrap">
      {options.map(opt => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className="flex-1 py-2 px-3 rounded-lg font-sans text-sm font-medium transition-colors min-w-[56px]"
          style={{
            background: value === opt.value ? 'var(--color-accent)' : 'var(--color-surface)',
            color:      value === opt.value ? '#fff' : 'var(--color-text)',
            border:     `1px solid ${value === opt.value ? 'var(--color-accent)' : 'var(--color-border)'}`,
            cursor: 'pointer',
            ...opt.style
          }}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

function Toggle({ label, value, onChange }) {
  return (
    <button
      className="flex items-center justify-between py-1 w-full font-sans"
      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text)' }}
      onClick={() => onChange(!value)}
    >
      <span style={{ fontSize: '0.95rem' }}>{label}</span>
      <div
        className="relative rounded-full transition-colors"
        style={{
          width: 44, height: 24,
          background: value ? 'var(--color-accent)' : 'var(--color-border)'
        }}
      >
        <div
          className="absolute top-1 rounded-full transition-transform"
          style={{
            width: 16, height: 16,
            background: 'white',
            left: 4,
            transform: value ? 'translateX(20px)' : 'translateX(0)',
            transition: 'transform 0.2s ease'
          }}
        />
      </div>
    </button>
  )
}
