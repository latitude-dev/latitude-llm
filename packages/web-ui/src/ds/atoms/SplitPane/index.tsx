'use client'

import {
  memo,
  ReactNode,
  RefObject,
  SyntheticEvent,
  useCallback,
  useEffect,
  useState,
} from 'react'

import { ResizableBox, ResizeCallbackData, ResizeHandle } from 'react-resizable'

import { useMeasure } from '../../../browser'
import { cn } from '../../../lib/utils'

const JS_PANEL_CLASS = 'js-pane'
function Pane({ children }: { children: ReactNode }) {
  return <div className={'flex flex-col h-full relative'}>{children}</div>
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

const PaneWrapper = ({
  children,
  isResizable = false,
  className,
}: {
  children: ReactNode
  width?: number | 'auto'
  isResizable?: boolean
  className?: string
}) => {
  return (
    <div
      className={cn(
        'h-full max-h-full custom-scrollbar w-full relative min-h-0',
        JS_PANEL_CLASS,
        {
          'flex-grow min-w-0': !isResizable,
        },
        className,
      )}
    >
      {children}
    </div>
  )
}

const SplitHandle = (
  _resizeHandle: ResizeHandle,
  ref: RefObject<HTMLDivElement>,
) => (
  <div
    ref={ref}
    className='group/handler w-2 z-10 h-full absolute -right-0.5 flex justify-center cursor-col-resize bg-transparent'
  >
    <div className='w-px h-full bg-border duration-200 transition-all group-hover/handler:w-0.5 group-hover/handler:bg-accent-foreground' />
  </div>
)

export const PANE_MIN_WIDTH = 280

function ResizablePane({
  minWidth,
  children,
  paneWidth,
  onResizePane,
  onResizeStop,
}: {
  minWidth: number
  children: ReactNode
  paneWidth: number
  onResizePane: (width: number) => void
  onResizeStop?: (width: number) => void
}) {
  const onResize = (_: SyntheticEvent, data: ResizeCallbackData) => {
    const lessThanMinWidth = minWidth ? data.size.width < minWidth : false
    if (lessThanMinWidth) {
      return
    }

    onResizePane(data.size.width)
  }
  const onStop = useCallback(
    (_e: SyntheticEvent, data: ResizeCallbackData) => {
      onResizeStop?.(data.size.width)
    },
    [onResizeStop],
  )
  return (
    <ResizableBox
      style={{ overflow: 'hidden' }}
      axis='x'
      width={paneWidth}
      minConstraints={[minWidth, Infinity]}
      className='flex relative flex-shrink-0 flex-grow-0'
      resizeHandles={['e']}
      handle={SplitHandle}
      onResize={onResize}
      onResizeStop={onStop}
    >
      {children}
    </ResizableBox>
  )
}

function HorizontalSplit({
  leftPane,
  rightPane,
  initialWidth,
  initialPercentage,
  minWidth,
  onResizeStop,
  cssPanelHeight,
  className,
}: {
  leftPane: ReactNode
  rightPane: ReactNode
  initialWidth?: number
  initialPercentage?: number
  minWidth: number
  onResizeStop?: (width: number) => void
  cssPanelHeight?: string
  className?: string
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
      )}
    >
      <ResizablePane
        minWidth={minWidth}
        paneWidth={paneWidth}
        onResizePane={setPaneWidth}
        onResizeStop={onResizeStop}
      >
        <PaneWrapper isResizable className={cssPanelHeight}>
          {leftPane}
        </PaneWrapper>
      </ResizablePane>
      <PaneWrapper className={cssPanelHeight}>{rightPane}</PaneWrapper>
    </div>
  )
}

const SplitPane = ({
  leftPane,
  rightPane,
  initialWidth,
  initialPercentage,
  minWidth,
  onResizeStop,
  cssPanelHeight,
  className,
}: {
  leftPane: ReactNode
  rightPane: ReactNode
  initialWidth?: number
  initialPercentage?: number
  minWidth: number
  onResizeStop?: (width: number) => void
  cssPanelHeight?: string
  className?: string
}) => {
  return (
    <HorizontalSplit
      className={className}
      cssPanelHeight={cssPanelHeight}
      leftPane={leftPane}
      rightPane={rightPane}
      initialWidth={initialWidth}
      initialPercentage={initialPercentage}
      minWidth={minWidth}
      onResizeStop={onResizeStop}
    />
  )
}

SplitPane.HorizontalSplit = memo(HorizontalSplit)
SplitPane.Pane = memo(Pane)

export default SplitPane
