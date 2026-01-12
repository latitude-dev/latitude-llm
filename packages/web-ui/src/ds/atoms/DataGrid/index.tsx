'use client'
import { Key, MouseEvent, ReactNode, useCallback, useRef } from 'react'
import {
  DataGrid as ReactDataGrid,
  RenderCheckboxProps,
  type DataGridProps,
} from 'react-data-grid'

export type {
  RenderCellProps,
  RenderEditCellProps,
  RenderHeaderCellProps,
  CellMouseArgs,
  CellMouseEvent,
  RowsChangeData,
  DataGridProps,
  DataGridHandle,
} from 'react-data-grid'

import { cn } from '../../../lib/utils'
import { Text } from '../Text'
import { CheckedState } from '../Checkbox'
import { CheckboxAtom } from '../Checkbox/Primitive'

export const DEFAULT_HEADER_ROW_HEIGHT = 40
export const DEFAULT_ROW_HEIGHT = 31

export { type EditorCellProps } from './EditCell/types'
export * from './EditCell/Editor'
export * from './EditCell/EditorWrapper'

const NoRowsFallback = ({ fallbackText }: { fallbackText: string }) => (
  <Text.H5>{fallbackText}</Text.H5>
)

const RenderCheckbox = ({
  checked: isChecked,
  indeterminate,
  onChange,
}: RenderCheckboxProps) => {
  const lastShiftKeyRef = useRef(false)
  const checked = indeterminate ? 'indeterminate' : isChecked
  const onClickLabel = useCallback((e: MouseEvent) => {
    lastShiftKeyRef.current = e.shiftKey
  }, [])
  const onChangeHandler = useCallback(
    (checkedState: CheckedState) => {
      const checked = checkedState === 'indeterminate' ? true : checkedState
      onChange(checked, lastShiftKeyRef.current)
    },
    [onChange],
  )

  return (
    <label
      onClickCapture={onClickLabel}
      className='flex items-center justify-center'
    >
      <CheckboxAtom checked={checked} onCheckedChange={onChangeHandler} />
    </label>
  )
}

export type Props<R, SR = unknown, K extends Key = Key> = DataGridProps<
  R,
  SR,
  K
> & {
  fallbackText?: string
  footer?: ReactNode
}

// NOTE: .latitude-data-grid is used to override css variables.
export default function DataGrid<R, SR = unknown, K extends Key = Key>({
  className,
  headerRowHeight = DEFAULT_HEADER_ROW_HEIGHT,
  rowHeight = DEFAULT_ROW_HEIGHT,
  fallbackText = 'No rows.',
  renderers,
  footer,
  ...rest
}: Props<R, SR, K>) {
  return (
    <div
      role='grid-wrapper'
      className='relative flex-1 min-h-0 flex flex-col max-w-full border rounded-lg '
    >
      <div className='flex flex-col flex-1 min-h-0 relative'>
        <ReactDataGrid<R, SR, K>
          className={cn(
            'latitude-data-grid custom-scrollbar rounded-t-lg',
            'relative max-h-full h-full',
            className,
          )}
          headerRowHeight={headerRowHeight}
          rowHeight={rowHeight}
          renderers={{
            ...renderers,
            noRowsFallback: <NoRowsFallback fallbackText={fallbackText} />,
            renderCheckbox: RenderCheckbox,
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

// Re-exporting react-data-grid
export { SelectColumn } from 'react-data-grid'
