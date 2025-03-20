'use client'

import { useMemo } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { DatasetRow, DatasetV2 } from '@latitude-data/core/browser'
import { useSearchParams } from 'next/navigation'
import { buildPagination } from '@latitude-data/core/lib/pagination/buildPagination'
import { ROUTES } from '$/services/routes'
import useDatasetRows from '$/stores/datasetRows'
import { useDatasetRole } from '$/hooks/useDatasetRoles'
import { useDatasetRowsSocket } from './useDatasetRowsSocket'
import { useFeatureFlag } from '$/components/Providers/FeatureFlags'
import { SimpleTable } from './SimpleTable'
import {
  TableWithHeader,
  Icon,
  Text,
  TableBlankSlate,
  Button,
} from '@latitude-data/web-ui'

const DataGrid = dynamic(() => import('./DataGrid'), {
  ssr: false,
})

export const ROWS_PAGE_SIZE = '100'
export function DatasetDetailTable({
  dataset,
  rows: serverDatasetRows,
  initialRenderIsProcessing,
}: {
  dataset: DatasetV2
  rows: DatasetRow[]
  initialRenderIsProcessing: boolean
}) {
  const datasetCellRoleStyles = useDatasetRole()
  const { enabled: showDataGrid } = useFeatureFlag({
    featureFlag: 'useDatagridInForDatasetRows',
  })
  const searchParams = useSearchParams()
  const page = searchParams.get('page') ?? '1'
  const pageSize = searchParams.get('pageSize') ?? ROWS_PAGE_SIZE
  const {
    data: rows,
    mutate,
    updateRows,
  } = useDatasetRows(
    { dataset, page, pageSize },
    {
      fallbackData: serverDatasetRows,
    },
  )
  const { isProcessing, processedRowsCount } = useDatasetRowsSocket({
    initialRenderIsProcessing,
    dataset,
    mutate,
    currentPage: Number(page),
    pageSize,
  })
  const pagination = useMemo(
    () =>
      buildPagination({
        count: Infinity,
        baseUrl: ROUTES.datasets.detail(dataset.id),
        page: Number(page),
        pageSize: Number(pageSize),
      }),
    [page, pageSize, dataset.id],
  )
  const props = {
    dataset,
    rows,
    pagination,
    isProcessing,
    processedRowsCount,
    datasetCellRoleStyles,
  }

  return (
    <TableWithHeader
      takeVertialSpace
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
            <>
              {showDataGrid ? (
                <DataGrid {...props} updateRows={updateRows} />
              ) : (
                <SimpleTable {...props} />
              )}
            </>
          ) : (
            <TableBlankSlate
              description='This dataset is empty'
              link={
                <Link href={ROUTES.datasets.root()}>
                  <Button variant='outline' fancy>
                    Back to dataset list
                  </Button>
                </Link>
              }
            />
          )}
        </>
      }
    />
  )
}
