export default function Abstract({ text }) {
  return (
    <div
      className="my-6 px-5 py-4 rounded-lg"
      style={{
        background: 'var(--color-surface)',
        borderLeft: '3px solid var(--color-accent)',
        color: 'var(--color-text)'
      }}
    >
      <p
        className="font-sans font-semibold mb-2 uppercase tracking-widest"
        style={{ fontSize: '0.7em', color: 'var(--color-text-secondary)' }}
      >
        Abstract
      </p>
      <p style={{ fontSize: '0.95em', lineHeight: '1.65' }}>{text}</p>
    </div>
  )
}
