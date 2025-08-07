import { type ReactNode, useEffect, useRef, useState } from 'react'

import { useMeasure } from '../../../../browser'
import { cn } from '../../../../lib/utils'
import { PaneWrapper, ResizablePane } from '../Common'
import { getGap, getGapWrapperPadding, type SplitGap } from '../index'

export function ReversedHorizontalSplit({
  leftPane,
  rightPane,
  visibleHandle = true,
  initialWidth,
  initialPercentage,
  minWidth,
  forcedWidth,
  onResizeStop,
  onDragStop,
  classNamePanelWrapper,
  initialWidthClass,
  className,
  gap,
  autoResize,
  dragDisabled,
}: {
  leftPane: ReactNode
  rightPane: ReactNode
  visibleHandle?: boolean
  initialWidth?: number
  initialPercentage?: number
  minWidth: number
  forcedWidth?: number
  onResizeStop?: (width: number) => void
  onDragStop?: (width: number) => void
  classNamePanelWrapper?: string
  initialWidthClass?: string
  className?: string
  gap?: SplitGap
  autoResize?: boolean
  dragDisabled?: boolean
}) {
  const [ref, { width: containerWidth }] = useMeasure<HTMLDivElement>()
  const [paneWidth, setPaneWidth] = useState<number>(initialWidth ?? 0)
  const prevContainerRef = useRef<number>(0)

  useEffect(() => {
    if (!initialPercentage || paneWidth > 0 || containerWidth === 0) return
    const pct = initialPercentage / 100
    setPaneWidth(Math.max(containerWidth * pct, minWidth))
  }, [initialPercentage, containerWidth, paneWidth, minWidth])

  useEffect(() => {
    if (!autoResize) return
    if (prevContainerRef.current > 0 && paneWidth > 0) {
      const ratio = paneWidth / prevContainerRef.current
      const newW = Math.max(containerWidth * ratio, minWidth)
      setPaneWidth(newW)
    }
    prevContainerRef.current = containerWidth
  }, [autoResize, containerWidth, paneWidth, minWidth])

  return (
    <div
      ref={ref}
      className={cn(
        'flex flex-row w-full relative h-full max-h-full min-h-full',
        className,
        getGap('horizontal', gap),
      )}
    >
      <PaneWrapper direction='horizontal' className={classNamePanelWrapper}>
        {leftPane}
      </PaneWrapper>

      <ResizablePane
        direction='horizontal'
        reversed
        visibleHandle={visibleHandle}
        minSize={minWidth}
        paneSize={forcedWidth !== undefined ? forcedWidth : paneWidth}
        widthClassWhileNoPaneWidth={initialWidthClass}
        onResizePane={setPaneWidth}
        onResizeStop={onResizeStop}
        onDragStop={onDragStop}
        dragDisabled={dragDisabled}
      >
        <PaneWrapper
          direction='horizontal'
          isResizable
          className={cn(
            classNamePanelWrapper,
            dragDisabled ? '' : getGapWrapperPadding('horizontal', gap),
          )}
        >
          {rightPane}
        </PaneWrapper>
      </ResizablePane>
    </div>
  )
}
