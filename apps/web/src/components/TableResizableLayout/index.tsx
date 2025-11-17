import { ReactNode, RefObject, useState, useRef, useEffect } from 'react'
import {
  ResizableBox,
  SplitHandle,
} from '@latitude-data/web-ui/atoms/Resizable'
import { cn } from '@latitude-data/web-ui/utils'

const MIN_RIGHT_PANE_WIDTH = 560
const RESIZE_HANDLES = ['w' as const]

export function TableResizableLayout({
  leftPane,
  rightPane,
  rightPaneRef,
  showRightPane,
  floatingPanel,
}: {
  leftPane: ReactNode
  rightPane: ReactNode
  rightPaneRef: RefObject<HTMLDivElement | null>
  showRightPane: boolean
  floatingPanel?: ReactNode
}) {
  const [isDragging, setIsDragging] = useState(false)
  const [rightPaneWidth, setRightPaneWidth] = useState<number | null>(null) // Start with null
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
        availableWidth * 0.3, // 30% of available width
        MIN_RIGHT_PANE_WIDTH, // But at least the minimum width
      )
      setRightPaneWidth(initialWidth)
    }
  }, [showRightPane, rightPaneWidth, containerWidth])

  const maxRightWidth = Math.max(containerWidth - 300, MIN_RIGHT_PANE_WIDTH)
  const shouldShowRightPane = showRightPane && rightPaneWidth !== null
  useEffect(() => {
    const width = showRightPane
      ? Math.max(containerWidth * 0.3, MIN_RIGHT_PANE_WIDTH)
      : 0
    setRightPaneWidth(width)
  }, [showRightPane, containerWidth])

  return (
    <div
      ref={containerRef}
      className={cn('flex flex-row h-full w-full', {
        'gap-4': shouldShowRightPane,
      })}
    >
      <div
        className={cn('pb-6', {
          'flex-1 min-w-0 h-full relative': shouldShowRightPane,
          'w-full h-full relative': !shouldShowRightPane,
        })}
      >
        {leftPane}
        {floatingPanel}
      </div>

      <ResizableBox
        width={rightPaneWidth ?? 0}
        height={Infinity}
        axis='x'
        minConstraints={[MIN_RIGHT_PANE_WIDTH, Infinity]}
        maxConstraints={[maxRightWidth, Infinity]}
        onResizeStart={() => setIsDragging(true)}
        onResize={(_e, data) => {
          setRightPaneWidth(data.size.width)
        }}
        onResizeStop={(_e, data) => {
          setIsDragging(false)
          setRightPaneWidth(data.size.width)
        }}
        resizeHandles={RESIZE_HANDLES}
        handle={SplitHandle({ visibleHandle: showRightPane })}
        className={cn('flex relative flex-shrink-0 flex-grow-0', {
          'pointer-events-none': isDragging,
          'transition-all duration-300 ease-in-out': !isDragging,
        })}
      >
        <div
          ref={rightPaneRef}
          className={cn('h-full w-full overflow-visible', {
            'pl-4': shouldShowRightPane,
            'opacity-0 pointer-events-none': !shouldShowRightPane,
          })}
          style={{ width: rightPaneWidth ?? 0 }}
        >
          {shouldShowRightPane ? rightPane : null}
        </div>
      </ResizableBox>
    </div>
  )
}
