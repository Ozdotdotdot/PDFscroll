import { useEffect, useState } from 'react'

export default function ProgressBar({ scrollContainerRef }) {
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    const container = scrollContainerRef?.current
    if (!container) return

    function onScroll() {
      const { scrollTop, scrollHeight, clientHeight } = container
      const max = scrollHeight - clientHeight
      setProgress(max > 0 ? (scrollTop / max) * 100 : 0)
    }

    container.addEventListener('scroll', onScroll, { passive: true })
    return () => container.removeEventListener('scroll', onScroll)
  }, [scrollContainerRef])

  return (
    <div
      className="fixed top-0 left-0 right-0 z-50"
      style={{ height: '2px', background: 'var(--color-border)' }}
    >
      <div
        style={{
          height: '100%',
          width: `${progress}%`,
          background: 'var(--color-accent)',
          transition: 'width 0.1s linear'
        }}
      />
    </div>
  )
}
