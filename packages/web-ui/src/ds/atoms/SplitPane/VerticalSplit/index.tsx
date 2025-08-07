import { type ReactNode, useEffect, useRef, useState } from 'react'

import { useMeasure } from '../../../../browser'
import { cn } from '../../../../lib/utils'
import { PaneWrapper, ResizablePane } from '../Common'
import { getGap, getGapWrapperPadding, type SplitGap } from '../index'

export function VerticalSplit({
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
  const [ref, { height: initialHeightFromRef }] = useMeasure<HTMLDivElement>()
  const [paneHeight, setPaneHeight] = useState<number>(initialHeight ?? 0)

  const oldHeightRef = useRef<number>(0)

  useEffect(() => {
    if (!initialPercentage) return
    if (paneHeight > 0) return
    if (initialHeightFromRef === 0) return

    const percentage = initialPercentage / 100
    setPaneHeight(Math.max(initialHeightFromRef * percentage, minHeight))
  }, [initialHeightFromRef, initialPercentage, minHeight, paneHeight])

  useEffect(() => {
    if (!autoResize) return
    if (oldHeightRef.current && oldHeightRef.current > 0 && paneHeight > 0) {
      const ratio = paneHeight / oldHeightRef.current
      const newPaneHeight = Math.max(initialHeightFromRef * ratio, minHeight)
      setPaneHeight(newPaneHeight)
    }
    oldHeightRef.current = initialHeightFromRef
  }, [initialHeightFromRef, paneHeight, minHeight, autoResize])

  return (
    <div
      ref={ref}
      className={cn('flex flex-col relative w-full h-full', className, getGap('vertical', gap))}
    >
      <ResizablePane
        direction='vertical'
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
          {topPane}
        </PaneWrapper>
      </ResizablePane>
      <PaneWrapper direction='vertical' className={classNamePanelWrapper}>
        {bottomPane}
      </PaneWrapper>
    </div>
  )
}
