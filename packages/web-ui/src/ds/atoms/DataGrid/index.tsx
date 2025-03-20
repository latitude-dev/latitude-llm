'use client'

import { ReactNode } from 'react'
import { DataGrid as ReactDataGrid, type DataGridProps } from 'react-data-grid'
import { cn } from '../../../lib/utils'

export type {
  RenderCellProps,
  CellClickArgs,
  CellMouseEvent,
  DataGridProps,
} from 'react-data-grid'

const DEFAULT_ROW_HEIGHT = 35

// TODO: style this better
const NoRowsFallback = ({ fallbackText }: { fallbackText: string }) => (
  <div>{fallbackText}</div>
)

export type Props<R> = DataGridProps<R> & {
  fallbackText?: string
  footer?: ReactNode
}

// NOTE: .latitude-data-grid is used to override css variables.
export default function DataGrid<R>({
  className,
  headerRowHeight = DEFAULT_ROW_HEIGHT,
  rowHeight = DEFAULT_ROW_HEIGHT,
  fallbackText = 'No rows.',
  renderers,
  footer,
  ...rest
}: Props<R>) {
  return (
    <div className='flex-1 min-h-0 flex flex-col h-full border rounded-lg '>
      <div className='flex flex-col flex-1 min-h-0 relative'>
        <ReactDataGrid<R>
          className={cn(
            'latitude-data-grid custom-scrollbar rounded-lg',
            'relative max-h-full h-full',
            className,
          )}
          headerRowHeight={headerRowHeight}
          rowHeight={rowHeight}
          renderers={{
            ...renderers,
            noRowsFallback: <NoRowsFallback fallbackText={fallbackText} />,
          }}
          {...rest}
        />
      </div>
      {footer ? (
        <div className='rounded-b-lg relative z-10 shrink-0 bg-muted w-full py-2 px-4'>
          {footer}
        </div>
      ) : null}
    </div>
  )
}
