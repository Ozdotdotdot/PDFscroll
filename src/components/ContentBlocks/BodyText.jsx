export default function BodyText({ text, type }) {
  if (type === 'caption') {
    return (
      <p
        className="font-sans text-center my-2"
        style={{
          fontSize: '0.82em',
          color: 'var(--color-text-secondary)',
          fontStyle: 'italic'
        }}
      >
        {text}
      </p>
    )
  }

  return (
    <p
      className="mb-4"
      style={{ color: 'var(--color-text)', hyphens: 'auto' }}
    >
      {text}
    </p>
  )
}
