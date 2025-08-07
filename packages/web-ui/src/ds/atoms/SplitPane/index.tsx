'use client'

import { memo, ReactNode, useEffect, useState } from 'react'

import { JS_PANEL_CLASS } from './Common'
import { HorizontalSplit } from './HorizontalSplit'
import { ReversedHorizontalSplit } from './ReversedHorizontalSplit'
import { ReversedVerticalSplit } from './ReversedVerticalSplit'
import { VerticalSplit } from './VerticalSplit'

export type SplitDirection = 'horizontal' | 'vertical'
export type SplitGap = 2 | 4 | 8

export function getGap(direction: SplitDirection, gap?: SplitGap) {
  switch (gap) {
    case 2:
      return direction === 'horizontal' ? 'gap-x-2' : 'gap-y-2'
    case 4:
      return direction === 'horizontal' ? 'gap-x-4' : 'gap-y-4'
    case 8:
      return direction === 'horizontal' ? 'gap-x-8' : 'gap-y-8'
    default:
      return ''
  }
}

export function getGapWrapperPadding(
  direction: SplitDirection,
  gap?: SplitGap,
) {
  switch (gap) {
    case 2:
      return direction === 'horizontal' ? 'pr-2' : 'mb-2'
    case 4:
      return direction === 'horizontal' ? 'pr-4' : 'mb-4'
    case 8:
      return direction === 'horizontal' ? 'pr-8' : 'mb-8'
    default:
      return ''
  }
}

export function usePanelDomRef({
  selfRef,
}: {
  selfRef: HTMLElement | null | undefined
}) {
  const [panelRef, setPanelRef] = useState<HTMLDivElement | undefined | null>(
    undefined,
  )
  useEffect(() => {
    if (!selfRef) return

    const pane = selfRef.closest(`.${JS_PANEL_CLASS}`) as HTMLDivElement
    setPanelRef(pane)
  }, [selfRef])

  return panelRef
}

function Pane({ children }: { children: ReactNode }) {
  return <div className={'flex flex-col h-full relative'}>{children}</div>
}

const SplitPane = ({
  direction,
  reversed,
  firstPane,
  secondPane,
  initialSize,
  forcedSize,
  initialPercentage,
  initialWidthClass,
  minSize,
  gap,
  onResizeStop,
  onDragStop,
  classNamePanelWrapper,
  className,
  visibleHandle = true,
  dragDisabled = false,
  autoResize,
}: {
  direction: SplitDirection
  reversed?: boolean
  firstPane: ReactNode
  secondPane: ReactNode
  initialSize?: number
  forcedSize?: number
  initialPercentage?: number
  initialWidthClass?: string
  minSize: number
  gap?: SplitGap
  onResizeStop?: (size: number) => void
  onDragStop?: (size: number) => void
  classNamePanelWrapper?: string
  className?: string
  visibleHandle?: boolean
  dragDisabled?: boolean
  autoResize?: boolean
}) => {
  if (direction === 'horizontal') {
    if (reversed) {
      return (
        <ReversedHorizontalSplit
          className={className}
          classNamePanelWrapper={classNamePanelWrapper}
          visibleHandle={visibleHandle}
          leftPane={firstPane}
          rightPane={secondPane}
          initialWidth={initialSize}
          forcedWidth={forcedSize}
          initialPercentage={initialPercentage}
          initialWidthClass={initialWidthClass}
          minWidth={minSize}
          gap={gap}
          onResizeStop={onResizeStop}
          onDragStop={onDragStop}
          dragDisabled={dragDisabled}
          autoResize={autoResize}
        />
      )
    }
    return (
      <HorizontalSplit
        className={className}
        classNamePanelWrapper={classNamePanelWrapper}
        visibleHandle={visibleHandle}
        leftPane={firstPane}
        rightPane={secondPane}
        initialWidth={initialSize}
        forcedWidth={forcedSize}
        initialPercentage={initialPercentage}
        initialWidthClass={initialWidthClass}
        minWidth={minSize}
        gap={gap}
        onResizeStop={onResizeStop}
        onDragStop={onDragStop}
        dragDisabled={dragDisabled}
        autoResize={autoResize}
      />
    )
  }

  if (reversed) {
    return (
      <ReversedVerticalSplit
        className={className}
        classNamePanelWrapper={classNamePanelWrapper}
        visibleHandle={visibleHandle}
        topPane={firstPane}
        bottomPane={secondPane}
        initialHeight={initialSize}
        forcedHeight={forcedSize}
        initialPercentage={initialPercentage}
        minHeight={minSize}
        gap={gap}
        onResizeStop={onResizeStop}
        onDragStop={onDragStop}
        dragDisabled={dragDisabled}
        autoResize={autoResize}
      />
    )
  }

  return (
    <VerticalSplit
      className={className}
      classNamePanelWrapper={classNamePanelWrapper}
      visibleHandle={visibleHandle}
      topPane={firstPane}
      bottomPane={secondPane}
      initialHeight={initialSize}
      forcedHeight={forcedSize}
      initialPercentage={initialPercentage}
      minHeight={minSize}
      gap={gap}
      onResizeStop={onResizeStop}
      onDragStop={onDragStop}
      dragDisabled={dragDisabled}
      autoResize={autoResize}
    />
  )
}

SplitPane.Pane = memo(Pane)

export { SplitPane }
