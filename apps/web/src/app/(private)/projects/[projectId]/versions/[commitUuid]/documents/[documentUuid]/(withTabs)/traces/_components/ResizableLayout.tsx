import { ReactNode, useState, useRef, useEffect } from 'react'
import {
  ResizableBox,
  SplitHandle,
} from '@latitude-data/web-ui/atoms/Resizable'
import { cn } from '@latitude-data/web-ui/utils'

const MIN_RIGHT_PANE_WIDTH = 200

export function ResizableLayout({
  leftPane,
  rightPane,
  showRightPane,
  floatingPanel,
  initialRightPaneWidth,
}: {
  leftPane: ReactNode
  rightPane: ReactNode
  showRightPane: boolean
  floatingPanel?: ReactNode
  initialRightPaneWidth?: number
}) {
  const [rightPaneWidth, setRightPaneWidth] = useState<number | null>(
    initialRightPaneWidth ?? null,
  )
  const containerRef = useRef<HTMLDivElement>(null)
  const [containerWidth, setContainerWidth] = useState(0)

  useEffect(() => {
    if (!containerRef.current) return

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const newContainerWidth = entry.contentRect.width
        setContainerWidth(newContainerWidth)

        // Update rightPaneWidth if container width changes significantly
        if (rightPaneWidth !== null && newContainerWidth > 0) {
          const maxWidth = Math.max(
            newContainerWidth - 300,
            MIN_RIGHT_PANE_WIDTH,
          )
          if (rightPaneWidth > maxWidth) {
            setRightPaneWidth(maxWidth)
          }
        }
      }
    })

    resizeObserver.observe(containerRef.current)
    return () => resizeObserver.disconnect()
  }, [rightPaneWidth])

  // Calculate initial width when showRightPane becomes true
  useEffect(() => {
    if (showRightPane && rightPaneWidth === null) {
      // Use window.innerWidth as a fallback for immediate calculation
      const availableWidth =
        containerWidth > 0 ? containerWidth : window.innerWidth
      const initialWidth = Math.max(
        availableWidth * 0.33, // 30% of available width
        MIN_RIGHT_PANE_WIDTH, // But at least the minimum width
      )
      setRightPaneWidth(initialWidth)
    }
  }, [showRightPane, rightPaneWidth, containerWidth])

  const maxRightWidth = Math.max(containerWidth - 300, MIN_RIGHT_PANE_WIDTH)
  const shouldShowRightPane = showRightPane && rightPaneWidth !== null

  return (
    <div ref={containerRef} className='grow flex flex-row h-full w-full gap-4'>
      <div
        className={cn('pb-6', {
          'flex-1 min-w-0 h-full relative': shouldShowRightPane,
          'w-full h-full relative': !shouldShowRightPane,
        })}
      >
        {leftPane}
        {floatingPanel}
      </div>

      {shouldShowRightPane && (
        <ResizableBox
          width={rightPaneWidth}
          height={Infinity}
          axis='x'
          minConstraints={[MIN_RIGHT_PANE_WIDTH, Infinity]}
          maxConstraints={[maxRightWidth, Infinity]}
          onResize={(_e, data) => {
            setRightPaneWidth(data.size.width)
          }}
          onResizeStop={(_e, data) => {
            setRightPaneWidth(data.size.width)
          }}
          resizeHandles={['w']}
          handle={SplitHandle({ visibleHandle: true })}
          className='flex relative flex-shrink-0 flex-grow-0'
        >
          <div
            className='h-full w-full overflow-visible pl-4'
            style={{ width: rightPaneWidth }}
          >
            {rightPane}
          </div>
        </ResizableBox>
      )}
    </div>
  )
}
