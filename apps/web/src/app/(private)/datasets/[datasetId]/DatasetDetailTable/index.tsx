'use client'

import { useCallback, useMemo } from 'react'
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
  TableSkeleton,
} from '@latitude-data/web-ui'

const DataGrid = dynamic(() => import('./DataGrid'), {
  ssr: false,
  loading: () => <TableSkeleton rows={8} cols={5} maxHeight={320} />,
})

function DatasetV1BlankSlate() {
  return (
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
  )
}

function DatasetBlankSlate({
  onClick,
  isCreating,
}: {
  onClick: () => void
  isCreating: boolean
}) {
  return (
    <TableBlankSlate
      description='This dataset is empty'
      link={
        <div className='flex flex-row items-center space-x-2'>
          <Button fancy onClick={onClick} disabled={isCreating}>
            {isCreating ? 'Creating...' : 'Create a row'}
          </Button>
          <Text.H5>or </Text.H5>
          <Link href={ROUTES.datasets.root()}>
            <Button variant='outline' fancy>
              Back to dataset list
            </Button>
          </Link>
        </div>
      }
    />
  )
}

export const ROWS_PAGE_SIZE = '100'
export function DatasetDetailTable({
  dataset,
  rows: serverDatasetRows,
  count,
  initialRenderIsProcessing,
}: {
  dataset: DatasetV2
  rows: DatasetRow[]
  initialRenderIsProcessing: boolean
  count: number
}) {
  const datasetCellRoleStyles = useDatasetRole()
  const { enabled: datasetsV2Enabled } = useFeatureFlag({
    featureFlag: 'useDatagridInForDatasetRows',
  })
  const searchParams = useSearchParams()
  const page = searchParams.get('page') ?? '1'
  const pageSize = searchParams.get('pageSize') ?? ROWS_PAGE_SIZE
  const {
    data: rows,
    mutate,
    updateRows,
    deleteRows,
    createRow,
    isCreating,
    isDeleting,
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
        count,
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

  const onClick = useCallback(() => {
    createRow({ datasetId: dataset.id })
  }, [createRow, dataset.id])
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
          {datasetsV2Enabled ? (
            <Button
              variant='outline'
              fancy
              onClick={onClick}
              disabled={isCreating}
            >
              {isCreating ? 'Creating...' : 'Create a row'}
            </Button>
          ) : null}
        </>
      }
      table={
        <>
          {rows.length > 0 ? (
            <>
              {datasetsV2Enabled ? (
                <DataGrid
                  {...props}
                  updateRows={updateRows}
                  deleteRows={deleteRows}
                  isDeleting={isDeleting}
                />
              ) : (
                <SimpleTable {...props} />
              )}
            </>
          ) : (
            <>
              {datasetsV2Enabled ? (
                <DatasetBlankSlate onClick={onClick} isCreating={isCreating} />
              ) : (
                <DatasetV1BlankSlate />
              )}
            </>
          )}
        </>
      }
    />
  )
}
