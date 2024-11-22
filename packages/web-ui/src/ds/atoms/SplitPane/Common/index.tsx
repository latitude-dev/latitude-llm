'use client'

import { ReactNode, RefObject, SyntheticEvent, useCallback } from 'react'

import { ResizableBox, ResizeCallbackData, ResizeHandle } from 'react-resizable'

import { SplitDirection } from '..'
import { cn } from '../../../../lib/utils'

export const JS_PANEL_CLASS = 'js-pane'

export const PaneWrapper = ({
  children,
  direction,
  isResizable = false,
  className,
}: {
  children: ReactNode
  direction: SplitDirection
  isResizable?: boolean
  className?: string
}) => {
  return (
    <div
      className={cn(
        'relative h-full w-full',
        JS_PANEL_CLASS,
        {
          'max-h-full min-h-0 custom-scrollbar': direction === 'horizontal',
          'flex-grow min-w-0': !isResizable && direction === 'horizontal',
          'max-w-full min-w-full overflow-hidden flex':
            direction === 'vertical',
        },
        className,
      )}
    >
      {children}
    </div>
  )
}

const SplitHandle = (
  resizeHandle: ResizeHandle,
  ref: RefObject<HTMLDivElement>,
) => {
  const direction = resizeHandle === 'e' ? 'horizontal' : 'vertical'
  return (
    <div
      ref={ref}
      className={cn('group/handler z-10 flex justify-center bg-transparent', {
        'w-2 h-full -right-0.5 cursor-col-resize absolute':
          direction === 'horizontal',
        'h-3 items-center w-full cursor-row-resize': direction === 'vertical',
      })}
    >
      <div
        className={cn(
          'bg-border duration-200 transition-all group-hover/handler:bg-accent-foreground',
          {
            'w-px h-full group-hover/handler:w-0.5': direction === 'horizontal',
            'h-px w-full group-hover/handler:h-0.5': direction === 'vertical',
          },
        )}
      />
    </div>
  )
}

export function ResizablePane({
  direction,
  minSize,
  children,
  paneSize,
  onResizePane,
  onResizeStop,
  dragDisabled,
}: {
  direction: SplitDirection
  minSize: number
  children: ReactNode
  paneSize: number
  onResizePane: (size: number) => void
  onResizeStop?: (size: number) => void
  dragDisabled?: boolean
}) {
  const onResize = (_: SyntheticEvent, data: ResizeCallbackData) => {
    const size = direction === 'horizontal' ? data.size.width : data.size.height
    const lessThanMinSize = minSize ? size < minSize : false

    if (lessThanMinSize) return

    onResizePane(size)
  }

  const onStop = useCallback(
    (_e: SyntheticEvent, data: ResizeCallbackData) => {
      const size =
        direction === 'horizontal' ? data.size.width : data.size.height
      onResizeStop?.(size)
    },
    [onResizeStop, direction],
  )

  if (direction === 'horizontal') {
    return (
      <ResizableBox
        width={paneSize}
        axis='x'
        minConstraints={[minSize, Infinity]}
        resizeHandles={dragDisabled ? [] : ['e']}
        className='overflow-hidden flex relative flex-shrink-0 flex-grow-0'
        handle={SplitHandle}
        onResize={onResize}
        onResizeStop={onStop}
      >
        {children}
      </ResizableBox>
    )
  }

  return (
    <ResizableBox
      height={paneSize}
      axis='y'
      minConstraints={[Infinity, minSize]}
      resizeHandles={dragDisabled ? [] : ['s']}
      className='overflow-hidden flex flex-col relative flex-shrink-0 flex-grow-0 w-full'
      handle={SplitHandle}
      onResize={onResize}
      onResizeStop={onStop}
    >
      {children}
    </ResizableBox>
  )
}
