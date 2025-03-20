import {
  useCallback,
  useState,
  ChangeEvent,
  FocusEvent,
  KeyboardEvent,
} from 'react'
import { createPortal } from 'react-dom'
import { TextArea } from '@latitude-data/web-ui'
import type { RenderEditCellProps } from '@latitude-data/web-ui/data-grid'
import { ClientDatasetRow } from '$/stores/datasetRows/rowSerializationHelpers'

const COMMIT_CHANGES_KEYS = ['Escape', 'Tab']
export function EditCell({
  row,
  column,
  onRowChange,
}: RenderEditCellProps<ClientDatasetRow, unknown>) {
  const rawValue = row.processedRowData[column.key]
  const initialValue = rawValue === undefined ? '' : String(rawValue)
  const [value, setValue] = useState(initialValue)
  const [position, setPosition] = useState<{
    top: number
    left: number
    width: number
    container: HTMLElement | null
  } | null>(null)

  const commitChanges = useCallback(() => {
    const commitChanges = true
    onRowChange(row, commitChanges)
  }, [row, onRowChange])

  const handleRef = useCallback((el: HTMLDivElement | null) => {
    if (!el) return

    const cellRect = el.getBoundingClientRect()
    const gridWrapperEl = el.closest(
      '[role="grid-wrapper"]',
    ) as HTMLElement | null

    if (!gridWrapperEl) return

    const preferredWidth = Math.max(cellRect.width, 230)
    const gridScrollLeft = gridWrapperEl.scrollLeft
    const gridScrollTop = gridWrapperEl.scrollTop
    const gridRect = gridWrapperEl.getBoundingClientRect()

    const relativeLeft = cellRect.left - gridRect.left + gridScrollLeft
    const relativeTop = cellRect.top - gridRect.top + gridScrollTop

    setPosition({
      top: relativeTop,
      left: relativeLeft,
      width: preferredWidth,
      container: gridWrapperEl,
    })
  }, [])

  const onFocus = useCallback((e: FocusEvent<HTMLTextAreaElement>) => {
    const length = e.target.value.length
    e.target.setSelectionRange(length, length)
  }, [])

  const onChange = useCallback(
    (e: ChangeEvent<HTMLTextAreaElement>) => {
      const prevData = row.processedRowData
      const changedValue = e.target.value
      const newRow = {
        ...row,
        rowData: { ...prevData, [column.key]: changedValue },
      }
      setValue(changedValue)
      onRowChange(newRow, false)
    },
    [row, column.key, onRowChange],
  )

  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      const key = e.key

      const isCmd = e.metaKey || e.ctrlKey
      if (isCmd && key === 'Enter') {
        e.stopPropagation()
        e.preventDefault()
        commitChanges()
      } else if (key === 'Enter') {
        e.stopPropagation()
      } else if (COMMIT_CHANGES_KEYS.includes(key)) {
        e.stopPropagation()
        e.preventDefault()
        commitChanges()
      }
    },
    [commitChanges],
  )

  const grid = position ? position.container : null
  const canCreatePortal = position && grid
  return (
    <div ref={handleRef} style={{ position: 'relative', height: '100%' }}>
      {canCreatePortal
        ? createPortal(
            <div
              className='absolute'
              style={{
                top: position.top,
                left: position.left,
                width: position.width,
                zIndex: 9999,
              }}
            >
              <TextArea
                value={value}
                className='min-w-72 resize'
                onChange={onChange}
                onKeyDown={onKeyDown}
                style={{
                  minWidth: position.width,
                }}
                autoFocus
                onFocus={onFocus}
                minRows={1}
                maxRows={5}
              />
            </div>,
            grid,
          )
        : null}
    </div>
  )
}
