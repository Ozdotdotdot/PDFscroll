export default function ListBlock({ listType, items }) {
  const Tag = listType === 'ordered' ? 'ol' : 'ul'
  return (
    <Tag
      className="mb-4 pl-6"
      style={{
        color: 'var(--color-text)',
        listStyleType: listType === 'ordered' ? 'decimal' : 'disc',
      }}
    >
      {items.map((item, i) => (
        <li key={i} className="mb-1" style={{ color: 'var(--color-text)' }}>
          {item}
        </li>
      ))}
    </Tag>
  )
}
