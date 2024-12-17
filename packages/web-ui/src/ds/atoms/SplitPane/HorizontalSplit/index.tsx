import { ReactNode, useEffect, useState } from 'react'

import { useMeasure } from '../../../../browser'
import { cn } from '../../../../lib/utils'
import { PaneWrapper, ResizablePane } from '../Common'
import { getGap, getGapWrapperPadding, SplitGap } from '../index'

export function HorizontalSplit({
  leftPane,
  rightPane,
  visibleHandle = true,
  initialWidth,
  initialPercentage,
  minWidth,
  forcedWidth,
  onResizeStop,
  classNamePanelWrapper,
  className,
  gap,
}: {
  leftPane: ReactNode
  rightPane: ReactNode
  visibleHandle?: boolean
  initialWidth?: number
  initialPercentage?: number
  minWidth: number
  forcedWidth?: number
  onResizeStop?: (width: number) => void
  classNamePanelWrapper?: string
  className?: string
  gap?: SplitGap
}) {
  const [ref, { width: initialWidthFromRef }] = useMeasure<HTMLDivElement>()
  const [paneWidth, setPaneWidth] = useState<number>(initialWidth ?? 0)
  useEffect(() => {
    if (paneWidth > 0) return

    if (!initialPercentage) return

    const percentage = initialPercentage / 100
    setPaneWidth(initialWidthFromRef * percentage)
  }, [initialWidth, initialWidthFromRef, initialPercentage])

  return (
    <div
      ref={ref}
      className={cn(
        'flex flex-row w-full relative h-full max-h-full min-h-full',
        className,
        getGap('horizontal', gap),
      )}
    >
      <ResizablePane
        direction='horizontal'
        visibleHandle={visibleHandle}
        minSize={minWidth}
        paneSize={forcedWidth !== undefined ? forcedWidth : paneWidth}
        onResizePane={setPaneWidth}
        onResizeStop={onResizeStop}
      >
        <PaneWrapper
          direction='horizontal'
          isResizable
          className={cn(
            classNamePanelWrapper,
            getGapWrapperPadding('horizontal', gap),
          )}
        >
          {leftPane}
        </PaneWrapper>
      </ResizablePane>
      <PaneWrapper direction='horizontal' className={classNamePanelWrapper}>
        {rightPane}
      </PaneWrapper>
    </div>
  )
}
