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

const SplitHandle =
  ({
    visibleHandle,
    hoverColor = 'accent',
    className,
  }: {
    visibleHandle: boolean
    hoverColor?: 'accent' | 'latte'
    className?: string
  }) =>
  (resizeHandle: ResizeHandle, ref: RefObject<HTMLDivElement>) => {
    const direction =
      resizeHandle === 'e' || resizeHandle === 'w' ? 'horizontal' : 'vertical'
    return (
      <div
        ref={ref}
        className={cn(
          'group/handler z-10 flex justify-center bg-transparent',
          {
            'absolute w-2 h-full cursor-col-resize top-0 bottom-0':
              direction === 'horizontal',
            '-right-1': resizeHandle === 'e',
            '-left-1': resizeHandle === 'w',
            'h-3 items-center w-full cursor-row-resize left-0 right-0':
              direction === 'vertical',
          },
          className,
        )}
      >
        <div
          className={cn('bg-border duration-200 transition-all', {
            'bg-border': visibleHandle,
            'bg-transparent': !visibleHandle,
            'w-px h-full group-hover/handler:w-0.5': direction === 'horizontal',
            'h-px w-full group-hover/handler:h-0.5': direction === 'vertical',
            'group-hover/handler:bg-latte-badge-border': hoverColor === 'latte',
            'group-hover/handler:bg-accent-foreground': hoverColor === 'accent',
          })}
        />
      </div>
    )
  }

export { SplitHandle }

export function ResizablePane({
  direction,
  reversed = false,
  visibleHandle = true,
  minSize,
  children,
  paneSize,
  widthClassWhileNoPaneWidth,
  onResizePane,
  onDragStop,
  onResizeStop,
  dragDisabled,
}: {
  direction: SplitDirection
  reversed?: boolean
  visibleHandle?: boolean
  minSize: number
  children: ReactNode
  paneSize: number
  onResizePane: (size: number) => void
  onResizeStop?: (size: number) => void
  onDragStop?: (size: number) => void
  widthClassWhileNoPaneWidth?: string
  dragDisabled?: boolean
}) {
  // During drag, we don't update React state at all to avoid rerenders
  // The visual resize is handled by react-resizable directly through DOM manipulation
  // We'll update React state only when the drag ends in onStop
  const onStop = useCallback(
    (_e: SyntheticEvent, data: ResizeCallbackData) => {
      const finalSize =
        direction === 'horizontal' ? data.size.width : data.size.height
      const adjustedSize = Math.max(finalSize, minSize)

      // Update React state only when drag ends
      onResizePane(adjustedSize)
      onDragStop?.(adjustedSize)
      onResizeStop?.(adjustedSize)
    },
    [onResizeStop, onDragStop, onResizePane, minSize, direction],
  )

  if (direction === 'horizontal') {
    return (
      <ResizableBox
        width={paneSize}
        axis='x'
        minConstraints={[minSize, Infinity]}
        resizeHandles={dragDisabled ? [] : reversed ? ['w'] : ['e']}
        className={cn('flex relative flex-shrink-0 flex-grow-0', {
          [`${widthClassWhileNoPaneWidth}`]:
            !paneSize && widthClassWhileNoPaneWidth,
        })}
        handle={SplitHandle({ visibleHandle })}
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
      resizeHandles={dragDisabled ? [] : reversed ? ['n'] : ['s']}
      className='flex flex-col relative flex-shrink-0 flex-grow-0 w-full'
      handle={SplitHandle({ visibleHandle })}
      onResizeStop={onStop}
    >
      {children}
    </ResizableBox>
  )
}
