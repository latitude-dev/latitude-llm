import { UpdateColumnModal } from '$/app/(private)/datasets/[datasetId]/DatasetDetailTable/DataGrid/UpdateColumnModal'
import { DatasetHeadText } from '$/app/(private)/datasets/_components/DatasetHeadText'
import { LinkableTablePaginationFooter } from '$/components/TablePaginationFooter'
import { DatasetRoleStyle } from '$/hooks/useDatasetRoles'
import useDatasetRows from '$/stores/datasetRows'
import { ClientDatasetRow } from '$/stores/datasetRows/rowSerializationHelpers'
import useDatasets from '$/stores/datasets'
import { ClientPagination } from '@latitude-data/core/lib/pagination/buildPagination'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import type {
  CellClickArgs,
  CellMouseEvent,
  Props as DataGridProps,
  RenderCellProps,
  RenderEditCellProps,
  RenderHeaderCellProps,
  RowsChangeData,
} from '@latitude-data/web-ui/atoms/DataGrid'
import BaseDataGrid, {
  DataGridCellEditor,
  EditorCellProps,
  SelectColumn,
} from '@latitude-data/web-ui/atoms/DataGrid'
import { FloatingPanel } from '@latitude-data/web-ui/atoms/FloatingPanel'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { ReactStateDispatch } from '@latitude-data/web-ui/commonTypes'
import { cn } from '@latitude-data/web-ui/utils'
import { Suspense, useCallback, useMemo, useState } from 'react'
import { Dataset } from '@latitude-data/core/schema/models/types/Dataset'

function rowKeyGetter(row: ClientDatasetRow) {
  return row.id
}

export type DatasetRowsTableProps = {
  dataset: Dataset
  rows: ClientDatasetRow[]
  selectedRow?: ClientDatasetRow
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

function RenderEditCell(props: RenderEditCellProps<ClientDatasetRow, unknown>) {
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
    <Suspense fallback={null}>
      <DataGridCellEditor
        valueType={valueType}
        value={initialValue}
        onChange={onChange}
      />
    </Suspense>
  )
}

const renderHeaderCell =
  ({
    setEditColumnKey,
    column,
  }: {
    setEditColumnKey: ReactStateDispatch<string | null>
    column: Dataset['columns'][0]
  }) =>
  (props: RenderHeaderCellProps<ClientDatasetRow>) => {
    const onClickEdit = useCallback(() => {
      setEditColumnKey(props.column.key)
    }, [props.column.key])
    return (
      <div className='flex items-center gap-x-2'>
        <DatasetHeadText text={column.name} role={column.role} />
        <Button
          className='opacity-30 group-hover/cell-header:opacity-100'
          variant='nope'
          iconProps={{ name: 'pencil', color: 'foregroundMuted' }}
          onClick={onClickEdit}
        />
      </div>
    )
  }

type Props = DatasetRowsTableProps & {
  updateRows: ReturnType<typeof useDatasetRows>['updateRows']
  deleteRows: ReturnType<typeof useDatasetRows>['deleteRows']
  isDeleting: boolean
}

const countLabel = (count: number) => `${count} rows`
export default function DataGrid({
  dataset: serverDataset,
  rows,
  selectedRow,
  updateRows,
  deleteRows,
  isDeleting,
  pagination,
  datasetCellRoleStyles,
}: Props) {
  const { data } = useDatasets({}, { fallbackData: [serverDataset] })
  const serverDatasetId = serverDataset.id
  const dataset = useMemo(() => {
    return data.find((d) => d.id === serverDatasetId) ?? serverDataset
  }, [data, serverDatasetId, serverDataset])
  const { backgroundCssClasses } = datasetCellRoleStyles
  const [selectedRows, setSelectedRows] = useState(
    () => new Set<number>(selectedRow ? [selectedRow.id] : []),
  )
  const [editColumnKey, setEditColumnKey] = useState<string | null>(null)
  const columns = useMemo<DataGridProps<ClientDatasetRow>['columns']>(() => {
    const dataColumns: DataGridProps<ClientDatasetRow>['columns'] =
      dataset.columns.map((col) => ({
        key: col.identifier,
        name: col.name,
        resizable: true,
        selectable: true,
        minWidth: 80,
        headerCellClass: cn(
          'group/cell-header',
          backgroundCssClasses[col.role],
        ),
        renderEditCell: RenderEditCell,
        renderHeaderCell: renderHeaderCell({
          column: col,
          setEditColumnKey,
        }),
        cellClass: backgroundCssClasses[col.role],
        renderCell,
      }))

    return [SelectColumn, ...dataColumns]
  }, [dataset.columns, backgroundCssClasses])
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
      {editColumnKey ? (
        <UpdateColumnModal
          dataset={dataset}
          columnKey={editColumnKey}
          onClose={() => setEditColumnKey(null)}
        />
      ) : null}
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
