export default function TitleBlock({ text }) {
  return (
    <h1
      className="font-serif font-bold leading-tight mb-4 mt-8"
      style={{
        fontSize: 'clamp(1.6rem, 4vw, 2.2rem)',
        color: 'var(--color-text)',
        letterSpacing: '-0.02em'
      }}
    >
      {text}
    </h1>
  )
}
