'use client'

import {
  DatasetColumnRole,
  DatasetRow,
  DatasetV2,
} from '@latitude-data/core/browser'
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
  Tooltip,
} from '@latitude-data/web-ui'
import { useSearchParams } from 'next/navigation'
import { buildPagination } from '@latitude-data/core/lib/pagination/buildPagination'
import { ROUTES } from '$/services/routes'
import { LinkableTablePaginationFooter } from '$/components/TablePaginationFooter'
import useDatasetRows from '$/stores/datasetRows'
import { useDatasetRole } from '$/hooks/useDatasetRoles'
import { useDatasetRowsSocket } from './useDatasetRowsSocket'

export function DatasetHeadText({
  text,
  role,
}: {
  text: string
  role: DatasetColumnRole
}) {
  if (role !== 'label') return <Text.H5>{text}</Text.H5>

  return (
    <Tooltip
      trigger={text}
      triggerBadge={{
        variant: 'accent',
        children: 'Label',
      }}
    >
      This column contains the expected output from the LLM response. Labels may
      be manually assigned or curated from production logs. Labels can help you
      evaluate an LLM based on ground-truth.
    </Tooltip>
  )
}

export const ROWS_PAGE_SIZE = '50'
export function DatasetDetailTable({
  dataset,
  rows: serverDatasetRows,
}: {
  dataset: DatasetV2
  rows: DatasetRow[]
}) {
  const { backgroundCssClasses } = useDatasetRole()
  const searchParams = useSearchParams()
  const page = searchParams.get('page') ?? '1'
  const pageSize = searchParams.get('pageSize') ?? ROWS_PAGE_SIZE
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
                    baseUrl: ROUTES.datasets.detail(dataset.id),
                    page: Number(page),
                    pageSize: Number(pageSize),
                  })}
                />
              }
            >
              <TableHeader>
                <TableRow verticalPadding>
                  {dataset.columns.map((column) => (
                    <TableHead
                      verticalBorder
                      key={column.identifier}
                      className={backgroundCssClasses[column.role]}
                    >
                      <DatasetHeadText text={column.name} role={column.role} />
                    </TableHead>
                  ))}
                  <TableHead className={backgroundCssClasses['metadata']}>
                    Created at
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id} verticalPadding hoverable={false}>
                    {row.cells.map((cell, index) => {
                      const role = dataset.columns[index]!.role
                      return (
                        <TableCell
                          verticalBorder
                          key={index}
                          className={backgroundCssClasses[role]}
                        >
                          <Text.H5 wordBreak='breakAll' ellipsis lineClamp={1}>
                            {cell}
                          </Text.H5>
                        </TableCell>
                      )
                    })}
                    <TableCell className={backgroundCssClasses['metadata']}>
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
