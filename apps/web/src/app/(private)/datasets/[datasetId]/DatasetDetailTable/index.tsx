'use client'

import dynamic from 'next/dynamic'
import { DatasetRow, DatasetV2 } from '@latitude-data/core/browser'
import { useSearchParams } from 'next/navigation'
import { buildPagination } from '@latitude-data/core/lib/pagination/buildPagination'
import { ROUTES } from '$/services/routes'
import useDatasetRows from '$/stores/datasetRows'
import { useDatasetRole } from '$/hooks/useDatasetRoles'
import { useDatasetRowsSocket } from './useDatasetRowsSocket'
import { useMemo } from 'react'
import { useFeatureFlag } from '$/components/Providers/FeatureFlags'
import { SimpleTable } from './SimpleTable'

const DataGrid = dynamic(() => import('./DataGrid'), {
  ssr: false,
})

export const ROWS_PAGE_SIZE = '100'
export function DatasetDetailTable({
  dataset,
  rows: serverDatasetRows,
}: {
  dataset: DatasetV2
  rows: DatasetRow[]
}) {
  const datasetCellRoleStyles = useDatasetRole()
  const { enabled: showDataGrid } = useFeatureFlag({
    featureFlag: 'useDatagridInForDatasetRows',
  })
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

  if (!showDataGrid) {
    return (
      <SimpleTable {...props} />
    )
  }

  return <DataGrid {...props} />
}
