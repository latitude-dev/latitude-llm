import BaseDataGrid from '@latitude-data/web-ui/data-grid'
import type {
  RenderCellProps,
  RenderEditCellProps,
  Props as DataGridProps,
  RowsChangeData,
  CellClickArgs,
  CellMouseEvent,
} from '@latitude-data/web-ui/data-grid'
import { Text } from '@latitude-data/web-ui'
import { DatasetRoleStyle } from '$/hooks/useDatasetRoles'
import { ClientDatasetRow } from '$/stores/datasetRows'
import { DatasetV2 } from '@latitude-data/core/browser'
import { ClientPagination } from '@latitude-data/core/lib/pagination/buildPagination'
import { useCallback, useMemo } from 'react'
import { LinkableTablePaginationFooter } from '$/components/TablePaginationFooter'
import { EditCell } from '$/app/(private)/datasets/[datasetId]/DatasetDetailTable/DataGrid/EditCell'

function rowKeyGetter(row: ClientDatasetRow) {
  return row.id
}

export type DatasetRowsTableProps = {
  dataset: DatasetV2
  rows: ClientDatasetRow[]
  pagination: ClientPagination
  datasetCellRoleStyles: DatasetRoleStyle
  isProcessing: boolean
  processedRowsCount: number
}

function renderCell(props: RenderCellProps<ClientDatasetRow, unknown>) {
  // TODO: this value is not cleaned up
  return (
    <Text.H5 ellipsis noWrap>
      {props.row.processedRowData[props.column.key]}
    </Text.H5>
  )
}

function renderEditCell(props: RenderEditCellProps<ClientDatasetRow, unknown>) {
  return <EditCell {...props} />
}

export default function DataGrid({
  dataset,
  rows,
  pagination,
}: DatasetRowsTableProps) {
  const columns = useMemo<DataGridProps<ClientDatasetRow>['columns']>(
    () =>
      dataset.columns.map((col) => ({
        key: col.identifier,
        name: col.name,
        renderEditCell,
        renderCell,
      })),
    [dataset.columns],
  )
  const onRowsChange = useCallback(
    (
      rows: ClientDatasetRow[],
      { indexes }: RowsChangeData<ClientDatasetRow>,
    ) => {
      const changedRows = indexes
        .map((index) => rows[index])
        .filter((r) => r !== undefined)

      console.log('CHANGED_ROWS', changedRows)
    },
    [],
  )
  const onCellClick = useCallback(
    (args: CellClickArgs<ClientDatasetRow>, event: CellMouseEvent) => {
      event.preventGridDefault()
      args.selectCell(true)
    },
    [],
  )
  return (
    <BaseDataGrid
      rowKeyGetter={rowKeyGetter}
      rows={rows}
      columns={columns}
      onRowsChange={onRowsChange}
      onCellClick={onCellClick}
      footer={<LinkableTablePaginationFooter pagination={pagination} />}
    />
  )
}
