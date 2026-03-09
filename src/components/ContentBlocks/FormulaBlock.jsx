export default function FormulaBlock({ src, inline }) {
  if (!src) return null

  if (inline) {
    return (
      <span className="inline-flex items-center mx-1 align-middle">
        <img
          src={src}
          alt="formula"
          loading="lazy"
          style={{
            maxHeight: '2.5em',
            objectFit: 'contain',
            filter: 'var(--formula-filter, none)'
          }}
        />
      </span>
    )
  }

  return (
    <div className="h-scroll my-5 py-1" style={{ textAlign: 'center' }}>
      <img
        src={src}
        alt="formula"
        loading="lazy"
        style={{
          maxWidth: 'none',
          maxHeight: '6em',
          objectFit: 'contain',
          filter: 'var(--formula-filter, none)'
        }}
      />
    </div>
  )
}
