import { useEffect, useRef } from 'react'
import TitleBlock from './ContentBlocks/TitleBlock.jsx'
import BodyText from './ContentBlocks/BodyText.jsx'
import SectionHeading from './ContentBlocks/SectionHeading.jsx'
import FigureBlock from './ContentBlocks/FigureBlock.jsx'

const PREVIEW_BLOCK_LIMIT = 12

export default function ProcessingScreen({ progress }) {
  const { current, total, blocks } = progress
  const pct = total > 0 ? Math.round((current / total) * 100) : 0
  const previewBlocks = blocks.slice(0, PREVIEW_BLOCK_LIMIT)

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ background: 'var(--color-bg)' }}
    >
      {/* Progress header */}
      <div
        className="sticky top-0 z-10 px-5 py-3 flex items-center gap-4 font-sans"
        style={{
          background: 'var(--color-bg)',
          borderBottom: '1px solid var(--color-border)',
          backdropFilter: 'blur(8px)'
        }}
      >
        <div className="flex-1">
          <div className="flex items-center justify-between mb-1.5">
            <span
              className="font-medium"
              style={{ fontSize: '0.88rem', color: 'var(--color-text)' }}
            >
              {total > 0
                ? `Extracting page ${current} of ${total}…`
                : 'Loading PDF…'}
            </span>
            <span
              style={{ fontSize: '0.82rem', color: 'var(--color-text-secondary)' }}
            >
              {pct}%
            </span>
          </div>
          <div
            className="w-full rounded-full overflow-hidden"
            style={{ height: 4, background: 'var(--color-border)' }}
          >
            <div
              className="rounded-full"
              style={{
                height: '100%',
                width: `${pct}%`,
                background: 'var(--color-accent)',
                transition: 'width 0.3s ease'
              }}
            />
          </div>
        </div>
      </div>

      {/* Live preview */}
      <div className="flex-1 overflow-y-auto px-4 py-6">
        {previewBlocks.length === 0 ? (
          <SkeletonPreview />
        ) : (
          <div className="content-area">
            {previewBlocks.map((block, i) => (
              <PreviewBlock key={i} block={block} />
            ))}
            {/* Loading indicator at bottom */}
            {current < total && (
              <div className="flex items-center gap-2 mt-6 mb-2">
                <div className="skeleton rounded" style={{ width: '100%', height: 16 }} />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function PreviewBlock({ block }) {
  switch (block.type) {
    case 'title':
      return <TitleBlock text={block.text} />
    case 'heading':
      return <SectionHeading level={block.level} text={block.text} />
    case 'paragraph':
      return <BodyText text={block.text} />
    case 'figure':
      return <FigureBlock src={block.src} caption={block.caption} />
    default:
      return null
  }
}

function SkeletonPreview() {
  return (
    <div className="content-area" style={{ paddingTop: 8 }}>
      {/* Title skeleton */}
      <div className="skeleton mb-2 rounded" style={{ height: 36, width: '85%' }} />
      <div className="skeleton mb-6 rounded" style={{ height: 36, width: '60%' }} />
      {/* Author skeleton */}
      <div className="skeleton mb-2 rounded" style={{ height: 16, width: '70%' }} />
      <div className="skeleton mb-8 rounded" style={{ height: 16, width: '55%' }} />
      {/* Body skeletons */}
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="mb-4">
          <div className="skeleton mb-1.5 rounded" style={{ height: 15, width: '100%' }} />
          <div className="skeleton mb-1.5 rounded" style={{ height: 15, width: '97%' }} />
          <div className="skeleton mb-1.5 rounded" style={{ height: 15, width: '94%' }} />
          <div className="skeleton rounded" style={{ height: 15, width: i % 2 === 0 ? '78%' : '85%' }} />
        </div>
      ))}
    </div>
  )
}
