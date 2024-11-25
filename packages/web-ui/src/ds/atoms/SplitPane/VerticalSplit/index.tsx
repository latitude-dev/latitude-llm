import { ReactNode, useEffect, useState } from 'react'

import { useMeasure } from '../../../../browser'
import { cn } from '../../../../lib/utils'
import { PaneWrapper, ResizablePane } from '../Common'
import { getGap, getGapWrapperPadding, SplitGap } from '../index'

export function VerticalSplit({
  topPane,
  bottomPane,
  initialHeight,
  initialPercentage,
  minHeight,
  forcedHeight,
  onResizeStop,
  classNamePanelWrapper,
  className,
  gap,
  dragDisabled,
}: {
  topPane: ReactNode
  bottomPane: ReactNode
  initialHeight?: number
  initialPercentage?: number
  minHeight: number
  forcedHeight?: number
  onResizeStop?: (width: number) => void
  classNamePanelWrapper?: string
  className?: string
  gap?: SplitGap
  dragDisabled?: boolean
}) {
  const [ref, { height: initialHeightFromRef }] = useMeasure<HTMLDivElement>()
  const [paneHeight, setPaneHeight] = useState<number>(initialHeight ?? 0)
  useEffect(() => {
    if (paneHeight > 0) return

    if (!initialPercentage) return

    const percentage = initialPercentage / 100
    setPaneHeight(initialHeightFromRef * percentage)
  }, [initialHeight, initialHeightFromRef, initialPercentage])
  return (
    <div
      ref={ref}
      className={cn(
        'flex flex-col relative w-full h-full',
        className,
        getGap('vertical', gap),
      )}
    >
      <ResizablePane
        direction='vertical'
        minSize={minHeight}
        paneSize={forcedHeight !== undefined ? forcedHeight : paneHeight}
        onResizePane={setPaneHeight}
        onResizeStop={onResizeStop}
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
