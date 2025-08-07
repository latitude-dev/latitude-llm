import { type ReactNode, useEffect, useRef, useState } from 'react'

import { useMeasure } from '../../../../browser'
import { cn } from '../../../../lib/utils'
import { PaneWrapper, ResizablePane } from '../Common'
import { getGap, getGapWrapperPadding, type SplitGap } from '../index'

export function ReversedVerticalSplit({
  topPane,
  bottomPane,
  visibleHandle = true,
  initialHeight,
  initialPercentage,
  minHeight,
  forcedHeight,
  onResizeStop,
  onDragStop,
  classNamePanelWrapper,
  className,
  gap,
  dragDisabled,
  autoResize,
}: {
  topPane: ReactNode
  bottomPane: ReactNode
  visibleHandle?: boolean
  initialHeight?: number
  initialPercentage?: number
  minHeight: number
  forcedHeight?: number
  onResizeStop?: (height: number) => void
  onDragStop?: (height: number) => void
  classNamePanelWrapper?: string
  className?: string
  gap?: SplitGap
  dragDisabled?: boolean
  autoResize?: boolean
}) {
  const [ref, { height: containerHeight }] = useMeasure<HTMLDivElement>()
  const [paneHeight, setPaneHeight] = useState<number>(initialHeight ?? 0)
  const prevContainerRef = useRef<number>(0)

  useEffect(() => {
    if (!initialPercentage || paneHeight > 0 || containerHeight === 0) return
    const pct = initialPercentage / 100
    setPaneHeight(Math.max(containerHeight * pct, minHeight))
  }, [initialPercentage, containerHeight, paneHeight, minHeight])

  useEffect(() => {
    if (!autoResize) return
    if (prevContainerRef.current > 0 && paneHeight > 0) {
      const ratio = paneHeight / prevContainerRef.current
      const newH = Math.max(containerHeight * ratio, minHeight)
      setPaneHeight(newH)
    }
    prevContainerRef.current = containerHeight
  }, [autoResize, containerHeight, paneHeight, minHeight])

  return (
    <div
      ref={ref}
      className={cn('flex flex-col relative w-full h-full', className, getGap('vertical', gap))}
    >
      <PaneWrapper direction='vertical' className={classNamePanelWrapper}>
        {topPane}
      </PaneWrapper>

      <ResizablePane
        direction='vertical'
        reversed
        visibleHandle={visibleHandle}
        minSize={minHeight}
        paneSize={forcedHeight !== undefined ? forcedHeight : paneHeight}
        onResizePane={setPaneHeight}
        onResizeStop={onResizeStop}
        onDragStop={onDragStop}
        dragDisabled={dragDisabled}
      >
        <PaneWrapper
          direction='vertical'
          isResizable
          className={cn(
            classNamePanelWrapper,
            dragDisabled ? '' : getGapWrapperPadding('vertical', gap),
          )}
        >
          {bottomPane}
        </PaneWrapper>
      </ResizablePane>
    </div>
  )
}
