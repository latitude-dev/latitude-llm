'use client'

import {
  memo,
  ReactNode,
  RefObject,
  SyntheticEvent,
  useCallback,
  useState,
} from 'react'

import { ResizableBox, ResizeCallbackData, ResizeHandle } from 'react-resizable'

import { cn } from '../../../lib/utils'

function Pane({ children }: { children: ReactNode }) {
  return <div className='flex flex-col h-full relative'>{children}</div>
}

const PaneWrapper = ({
  width = 'auto',
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
      className={cn('h-full overflow-y-auto custom-scrollbar', className)}
      style={{
        width: width === 'auto' ? 'auto' : isResizable ? width - 1 : width,
      }}
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
    <div className='w-px h-full bg-gray-200 duration-200 transition-all group-hover/handler:w-0.5 group-hover/handler:bg-accent-foreground' />
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
  onResizeStop: (width: number) => void
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
      onResizeStop(data.size.width)
    },
    [onResizeStop],
  )
  return (
    <ResizableBox
      style={{ overflow: 'hidden' }}
      axis='x'
      width={paneWidth}
      minConstraints={[minWidth, Infinity]}
      className='flex relative'
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
  minWidth,
  onResizeStop,
  cssPanelHeight,
}: {
  leftPane: ReactNode
  rightPane: ReactNode
  initialWidth: number
  minWidth: number
  onResizeStop: (width: number) => void
  cssPanelHeight?: string
}) {
  const [paneWidth, setPaneWidth] = useState<number>(initialWidth)
  const width = typeof window !== 'undefined' ? paneWidth : initialWidth
  return (
    <div className='min-h-full w-full grid grid-cols-[auto,1fr]'>
      <ResizablePane
        minWidth={minWidth}
        paneWidth={paneWidth}
        onResizePane={setPaneWidth}
        onResizeStop={onResizeStop}
      >
        <PaneWrapper isResizable width={width} className={cssPanelHeight}>
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
  minWidth,
  onResizeStop,
  cssPanelHeight,
}: {
  leftPane: ReactNode
  rightPane: ReactNode
  initialWidth: number
  minWidth: number
  onResizeStop: (width: number) => void
  cssPanelHeight?: string
}) => {
  return (
    <HorizontalSplit
      cssPanelHeight={cssPanelHeight}
      leftPane={leftPane}
      rightPane={rightPane}
      initialWidth={initialWidth}
      minWidth={minWidth}
      onResizeStop={onResizeStop}
    />
  )
}

SplitPane.HorizontalSplit = memo(HorizontalSplit)
SplitPane.Pane = memo(Pane)

export default SplitPane
