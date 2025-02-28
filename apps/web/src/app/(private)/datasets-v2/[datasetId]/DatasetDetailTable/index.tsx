'use client'

import { DatasetRow, DatasetV2 } from '@latitude-data/core/browser'
import {
  dateFormatter,
  Icon,
  Table,
  TableBlankSlate,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableWithHeader,
  Text,
} from '@latitude-data/web-ui'
import { useSearchParams } from 'next/navigation'
import { buildPagination } from '@latitude-data/core/lib/pagination/buildPagination'
import { ROUTES } from '$/services/routes'
import { LinkableTablePaginationFooter } from '$/components/TablePaginationFooter'
import useDatasetRows from '$/stores/datasetRows'
import { useDatasetRowsSocket } from '$/app/(private)/datasets-v2/[datasetId]/DatasetDetailTable/useDatasetRowsSocket'

export function DatasetDetailTable({
  dataset,
  rows: serverDatasetRows,
}: {
  dataset: DatasetV2
  rows: DatasetRow[]
}) {
  const searchParams = useSearchParams()
  const page = searchParams.get('page') ?? '1'
  const pageSize = searchParams.get('pageSize') ?? '25'
  const { data: rows, mutate } = useDatasetRows(
    { dataset, page, pageSize },
    {
      fallbackData: serverDatasetRows,
    },
  )
  const { isProcessing, processedRowsCount } = useDatasetRowsSocket({
    dataset,
    mutate,
    currentPage: Number(page),
    pageSize,
  })

  return (
    <TableWithHeader
      title={dataset.name}
      actions={
        <>
          {isProcessing ? (
            <div className='flex flex-row items-center space-x-2'>
              <Icon
                name='loader'
                spin
                spinSpeed='fast'
                size='large'
                color='primary'
              />
              <Text.H6 color='foregroundMuted'>
                {processedRowsCount} rows processed...
              </Text.H6>
            </div>
          ) : null}
        </>
      }
      table={
        <>
          {rows.length > 0 ? (
            <Table
              externalFooter={
                <LinkableTablePaginationFooter
                  pagination={buildPagination({
                    count: Infinity,
                    baseUrl: ROUTES.datasetsV2.detail(dataset.id),
                    page: Number(page),
                    pageSize: Number(pageSize),
                  })}
                />
              }
            >
              <TableHeader>
                <TableRow verticalPadding>
                  {dataset.columns.map((column) => (
                    <TableHead key={column.identifier}>
                      <Text.H5>{column.name}</Text.H5>
                    </TableHead>
                  ))}
                  <TableHead>Created at</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id} verticalPadding hoverable={false}>
                    {row.cells.map((cell, index) => (
                      <TableCell key={index}>
                        <Text.H5>{cell}</Text.H5>
                      </TableCell>
                    ))}
                    <TableCell>
                      <Text.H5 color='foregroundMuted'>
                        {dateFormatter.formatDate(row.createdAt)}
                      </Text.H5>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <TableBlankSlate description='This dataset is empty' />
          )}
        </>
      }
    />
  )
}
