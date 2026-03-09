export default function SectionHeading({ level, text }) {
  if (level === 1) {
    return (
      <h2
        className="font-serif font-bold mt-10 mb-3"
        style={{
          fontSize: '1.35em',
          color: 'var(--color-text)',
          borderBottom: '1px solid var(--color-border)',
          paddingBottom: '0.3em'
        }}
      >
        {text}
      </h2>
    )
  }
  return (
    <h3
      className="font-serif font-semibold mt-7 mb-2"
      style={{ fontSize: '1.1em', color: 'var(--color-text)' }}
    >
      {text}
    </h3>
  )
}
