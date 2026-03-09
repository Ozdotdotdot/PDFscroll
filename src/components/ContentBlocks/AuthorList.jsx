export default function AuthorList({ names }) {
  if (!names || names.length === 0) return null
  return (
    <p
      className="mb-3 font-sans"
      style={{
        fontSize: '0.95em',
        color: 'var(--color-text-secondary)',
        fontStyle: 'italic'
      }}
    >
      {names.join(', ')}
    </p>
  )
}
