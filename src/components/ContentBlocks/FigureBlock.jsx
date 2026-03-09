export default function FigureBlock({ src, caption, onImageClick }) {
  if (!src) return null
  return (
    <figure className="my-6" style={{ margin: '1.5em 0' }}>
      <img
        src={src}
        alt={caption || 'Figure'}
        loading="lazy"
        onClick={() => onImageClick?.(src, caption)}
        className="rounded-lg cursor-pointer w-full"
        style={{
          display: 'block',
          maxWidth: '100%',
          height: 'auto',
          objectFit: 'contain',
          boxShadow: '0 1px 6px rgba(0,0,0,0.12)',
          borderRadius: '8px'
        }}
      />
      {caption && (
        <figcaption
          className="font-sans text-center mt-2"
          style={{
            fontSize: '0.82em',
            color: 'var(--color-text-secondary)',
            fontStyle: 'italic'
          }}
        >
          {caption}
        </figcaption>
      )}
    </figure>
  )
}
