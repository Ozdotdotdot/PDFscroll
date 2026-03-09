export default function TableBlock({ headers, rows }) {
  if (!rows || rows.length === 0) return null
  return (
    <div className="h-scroll my-6 rounded-lg" style={{ border: '1px solid var(--color-border)' }}>
      <table
        className="font-sans text-sm border-collapse"
        style={{ minWidth: '100%', fontSize: '0.88em' }}
      >
        {headers && headers.length > 0 && (
          <thead>
            <tr>
              {headers.map((h, i) => (
                <th
                  key={i}
                  className="text-left px-3 py-2 font-semibold"
                  style={{
                    background: 'var(--color-surface)',
                    borderBottom: '2px solid var(--color-border)',
                    color: 'var(--color-text)',
                    whiteSpace: 'nowrap'
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
        )}
        <tbody>
          {rows.map((row, ri) => (
            <tr
              key={ri}
              style={{
                background: ri % 2 === 0 ? 'transparent' : 'var(--color-surface)'
              }}
            >
              {row.map((cell, ci) => (
                <td
                  key={ci}
                  className="px-3 py-2"
                  style={{
                    borderBottom: '1px solid var(--color-border)',
                    color: 'var(--color-text)',
                    verticalAlign: 'top'
                  }}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
