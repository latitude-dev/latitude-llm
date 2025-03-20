import BaseDataGrid, { SelectColumn } from '@latitude-data/web-ui/data-grid'
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
import { DatasetV2 } from '@latitude-data/core/browser'
import { ClientPagination } from '@latitude-data/core/lib/pagination/buildPagination'
import { useCallback, useMemo, useState } from 'react'
import { LinkableTablePaginationFooter } from '$/components/TablePaginationFooter'
import { EditCell } from '$/app/(private)/datasets/[datasetId]/DatasetDetailTable/DataGrid/EditCell'
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

function renderEditCell(props: RenderEditCellProps<ClientDatasetRow, unknown>) {
  return <EditCell {...props} />
}

type Props = DatasetRowsTableProps & {
  updateRows: ReturnType<typeof useDatasetRows>['updateRows']
}

export default function DataGrid({
  dataset,
  rows,
  updateRows,
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
  return (
    <BaseDataGrid<ClientDatasetRow, unknown, number>
      rowKeyGetter={rowKeyGetter}
      rows={rows}
      columns={columns}
      onRowsChange={onRowsChange}
      onCellClick={onCellClick}
      selectedRows={selectedRows}
      onSelectedRowsChange={setSelectedRows}
      footer={<LinkableTablePaginationFooter pagination={pagination} />}
    />
  )
}
