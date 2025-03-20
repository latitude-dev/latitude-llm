import BaseDataGrid from '@latitude-data/web-ui/data-grid'
import type {
  CellClickArgs,
  CellMouseEvent,
  RenderCellProps,
  Props as DataGridProps,
} from '@latitude-data/web-ui/data-grid'
import { DatasetRoleStyle } from '$/hooks/useDatasetRoles'
import { ClientDatasetRow } from '$/stores/datasetRows'
import { DatasetV2 } from '@latitude-data/core/browser'
import { ClientPagination } from '@latitude-data/core/lib/pagination/buildPagination'
import { useCallback, useMemo } from 'react'
import { LinkableTablePaginationFooter } from '$/components/TablePaginationFooter'

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
  return <div className='hola'>{props.row.rowData[props.column.key]}</div>
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
        renderCell,
      })),
    [dataset.columns],
  )
  const onCellClick = useCallback(
    (_args: CellClickArgs<ClientDatasetRow>, _event: CellMouseEvent) => { },
    [],
  )

  return (
    <BaseDataGrid
      rowKeyGetter={rowKeyGetter}
      rows={rows}
      columns={columns}
      onCellClick={onCellClick}
      footer={<LinkableTablePaginationFooter pagination={pagination} />}
    />
  )
}
