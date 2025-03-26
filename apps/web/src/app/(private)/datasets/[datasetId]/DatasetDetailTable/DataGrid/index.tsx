import BaseDataGrid, { SelectColumn } from '@latitude-data/web-ui/data-grid'
import type {
  RenderCellProps,
  RenderEditCellProps,
  Props as DataGridProps,
  RowsChangeData,
  CellClickArgs,
  CellMouseEvent,
} from '@latitude-data/web-ui/data-grid'
import { DataGridCellEditor, type EditorCellProps } from '@latitude-data/web-ui'
import { Text, FloatingPanel, Button } from '@latitude-data/web-ui'
import { DatasetRoleStyle } from '$/hooks/useDatasetRoles'
import { DatasetV2 } from '@latitude-data/core/browser'
import { ClientPagination } from '@latitude-data/core/lib/pagination/buildPagination'
import { useCallback, useMemo, useState } from 'react'
import { LinkableTablePaginationFooter } from '$/components/TablePaginationFooter'
import { ClientDatasetRow } from '$/stores/datasetRows/rowSerializationHelpers'
import useDatasetRows from '$/stores/datasetRows'

function rowKeyGetter(row: ClientDatasetRow) {
  return row.id
}

export type DatasetRowsTableProps = {
  dataset: DatasetV2
  rows: ClientDatasetRow[]
  pagination: ClientPagination
  datasetCellRoleStyles: DatasetRoleStyle
}

function renderCell(props: RenderCellProps<ClientDatasetRow, unknown>) {
  return (
    <div className='max-w-72'>
      <Text.H5 ellipsis noWrap>
        {props.row.processedRowData[props.column.key]}
      </Text.H5>
    </div>
  )
}

function tryToParseJSON(value: string) {
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}

function renderEditCell(props: RenderEditCellProps<ClientDatasetRow, unknown>) {
  const row = props.row
  const column = props.column
  const onRowChange = props.onRowChange
  const onChange = useCallback(
    ({ value, commitChanges }: Parameters<EditorCellProps['onChange']>[0]) => {
      const prevData = row.rowData
      const newRow = {
        ...row,
        rowData: { ...prevData, [column.key]: tryToParseJSON(value) },
      }
      onRowChange(newRow, commitChanges)
    },
    [row, column.key, onRowChange],
  )
  const storedRowValue = row.rowData[column.key]
  const rawValue = row.processedRowData[column.key]
  const initialValue = rawValue === undefined ? '' : String(rawValue)
  const valueType = typeof storedRowValue === 'object' ? 'json' : 'text'
  return (
    <DataGridCellEditor
      valueType={valueType}
      value={initialValue}
      onChange={onChange}
    />
  )
}

type Props = DatasetRowsTableProps & {
  updateRows: ReturnType<typeof useDatasetRows>['updateRows']
  deleteRows: ReturnType<typeof useDatasetRows>['deleteRows']
  isDeleting: boolean
}

const countLabel = (count: number) => `${count} rows`
export default function DataGrid({
  dataset,
  rows,
  updateRows,
  deleteRows,
  isDeleting,
  pagination,
}: Props) {
  const [selectedRows, setSelectedRows] = useState(() => new Set<number>())
  const columns = useMemo<DataGridProps<ClientDatasetRow>['columns']>(() => {
    const dataColumns: DataGridProps<ClientDatasetRow>['columns'] =
      dataset.columns.map((col) => ({
        key: col.identifier,
        name: col.name,
        resizable: true,
        selectable: true,
        minWidth: 80,
        renderEditCell,
        renderCell,
      }))

    return [SelectColumn, ...dataColumns]
  }, [dataset.columns])
  const onCellClick = useCallback(
    (args: CellClickArgs<ClientDatasetRow>, event: CellMouseEvent) => {
      event.preventGridDefault()
      args.selectCell(true)
    },
    [],
  )

  const onRowsChange = useCallback(
    (
      rows: ClientDatasetRow[],
      { indexes }: RowsChangeData<ClientDatasetRow>,
    ) => {
      const changedRows = indexes
        .map((index) => rows[index])
        .filter((r) => r !== undefined)

      updateRows({ rows: changedRows })
    },
    [updateRows],
  )
  const onClickDelete = useCallback(async () => {
    const rowIdsToDelete = Array.from(selectedRows)
    await deleteRows({
      datasetId: dataset.id,
      rowIds: rowIdsToDelete,
    })
    setSelectedRows(new Set<number>())
  }, [deleteRows, selectedRows, dataset.id, setSelectedRows])

  return (
    <>
      <BaseDataGrid<ClientDatasetRow, unknown, number>
        rowKeyGetter={rowKeyGetter}
        rows={rows}
        columns={columns}
        onRowsChange={onRowsChange}
        onCellClick={onCellClick}
        selectedRows={selectedRows}
        onSelectedRowsChange={setSelectedRows}
        footer={
          <LinkableTablePaginationFooter
            pagination={pagination}
            countLabel={countLabel}
          />
        }
      />
      <div className='z-40 flex justify-center absolute left-0 right-0 bottom-4 pointer-events-none'>
        <FloatingPanel visible={selectedRows.size > 0}>
          <div className='flex flex-row justify-between gap-x-4'>
            <Button
              fancy
              variant='destructive'
              disabled={isDeleting || selectedRows.size === 0}
              onClick={onClickDelete}
            >
              {isDeleting ? 'Deleting rows...' : 'Delete rows'}
            </Button>
            <Button
              fancy
              variant='outline'
              onClick={() => setSelectedRows(new Set<number>())}
            >
              Clear selection
            </Button>
          </div>
        </FloatingPanel>
      </div>
    </>
  )
}
