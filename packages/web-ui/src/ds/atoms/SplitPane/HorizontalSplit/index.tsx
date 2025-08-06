import { memo, ReactNode, useEffect, useRef, useState } from 'react'

import { useMeasure } from '../../../../browser'
import { cn } from '../../../../lib/utils'
import { PaneWrapper, ResizablePane } from '../Common'
import { getGap, getGapWrapperPadding, SplitGap } from '../index'

export const HorizontalSplit = memo(
  ({
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
    initialWidthClass?: string
    initialPercentage?: number
    minWidth: number
    forcedWidth?: number
    onResizeStop?: (width: number) => void
    onDragStop?: (width: number) => void
    classNamePanelWrapper?: string
    className?: string
    gap?: SplitGap
    autoResize?: boolean
    dragDisabled?: boolean
  }) => {
    const [ref, { width: initialWidthFromRef }] = useMeasure<HTMLDivElement>()
    const [paneWidth, setPaneWidth] = useState<number>(initialWidth ?? 0)

    const oldWidthRef = useRef<number>(0)

    useEffect(() => {
      if (!initialPercentage) return
      if (paneWidth > 0) return
      if (initialWidthFromRef === 0) return

      const percentage = initialPercentage / 100
      setPaneWidth(Math.max(initialWidthFromRef * percentage, minWidth))
      // FIXME: Do not use useEffect to set local state paneWidth.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [initialWidth, initialWidthFromRef, initialPercentage, minWidth])

    useEffect(() => {
      if (!autoResize) return
      if (oldWidthRef.current && oldWidthRef.current > 0 && paneWidth > 0) {
        const ratio = paneWidth / oldWidthRef.current
        const newPaneWidth = Math.max(initialWidthFromRef * ratio, minWidth)
        setPaneWidth(newPaneWidth)
      }
      oldWidthRef.current = initialWidthFromRef
    }, [initialWidthFromRef, paneWidth, minWidth, autoResize])

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
            {leftPane}
          </PaneWrapper>
        </ResizablePane>
        <PaneWrapper direction='horizontal' className={classNamePanelWrapper}>
          {rightPane}
        </PaneWrapper>
      </div>
    )
  },
)
