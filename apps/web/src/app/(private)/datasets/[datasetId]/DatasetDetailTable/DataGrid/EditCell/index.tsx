import { useCallback, useState, ChangeEvent, FocusEvent } from 'react'
import { createPortal } from 'react-dom'
import { TextArea } from '@latitude-data/web-ui'
import type { RenderEditCellProps } from '@latitude-data/web-ui/data-grid'
import { ClientDatasetRow } from '$/stores/datasetRows'

export function EditCell({
  row,
  column,
  onRowChange,
}: RenderEditCellProps<ClientDatasetRow, unknown>) {
  const rawValue = row.rowData[column.key]
  const value = rawValue === null ? '' : String(rawValue)
  const [position, setPosition] = useState<{
    top: number
    left: number
    width: number
  } | null>(null)

  const onChange = useCallback(
    (e: ChangeEvent<HTMLTextAreaElement>) => {
      const prevData = row.rowData
      const newRow = {
        ...row,
        rowData: { ...prevData, [column.key]: e.target.value },
      }
      const commitChanges = false
      onRowChange(newRow, commitChanges)
    },
    [row, column.key, onRowChange],
  )

  const handleRef = useCallback((el: HTMLDivElement | null) => {
    if (el) {
      const rect = el.getBoundingClientRect()
      const preferredWidth = Math.max(rect.width, 230)
      const spaceRight = window.innerWidth - rect.right
      const openLeft = spaceRight < preferredWidth

      const left = openLeft
        ? rect.right + window.scrollX - preferredWidth
        : rect.left + window.scrollX

      setPosition({
        top: rect.top + window.scrollY,
        left,
        width: preferredWidth,
      })
    }
  }, [])

  const onFocus = useCallback((e: FocusEvent<HTMLTextAreaElement>) => {
    const length = e.target.value.length
    e.target.setSelectionRange(length, length)
  }, [])

  return (
    <div ref={handleRef} style={{ position: 'relative', height: '100%' }}>
      {position &&
        createPortal(
          <div
            className='absolute z-50'
            style={{
              top: position.top,
              left: position.left,
              width: position.width,
            }}
          >
            <TextArea
              value={value}
              className='min-w-72'
              onChange={onChange}
              autoFocus
              onFocus={onFocus}
              minRows={1}
              maxRows={5}
            />
          </div>,
          document.body,
        )}
    </div>
  )
}
