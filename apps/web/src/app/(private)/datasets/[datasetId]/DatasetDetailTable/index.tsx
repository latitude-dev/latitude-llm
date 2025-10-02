'use client'

import { useDatasetRole } from '$/hooks/useDatasetRoles'
import { ROUTES } from '$/services/routes'
import useDatasetRows from '$/stores/datasetRows'
import { buildPagination } from '@latitude-data/core/lib/pagination/buildPagination'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { TableWithHeader } from '@latitude-data/web-ui/molecules/ListingHeader'
import { TableBlankSlate } from '@latitude-data/web-ui/molecules/TableBlankSlate'
import { TableSkeleton } from '@latitude-data/web-ui/molecules/TableSkeleton'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useCallback, useMemo } from 'react'
import { useDatasetRowsSocket } from './useDatasetRowsSocket'
import { Alert } from '@latitude-data/web-ui/atoms/Alert'
import { format } from 'date-fns'
import { DatasetRow, Dataset } from '@latitude-data/core/schema/types'

export const DeletedDatasetAlert = ({ deletedAt }: { deletedAt: Date }) => {
  return (
    <Alert
      title='This dataset has been deleted'
      description={`This dataset was deleted on the ${format(deletedAt, 'MM/dd/yyyy')}`}
      variant='warning'
    />
  )
}

const DataGrid = dynamic(() => import('./DataGrid'), {
  ssr: false,
  loading: () => <TableSkeleton rows={8} cols={5} maxHeight={320} />,
})

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
  dataset: Dataset
  rows: DatasetRow[]
  initialRenderIsProcessing: boolean
  count: number
}) {
  const datasetCellRoleStyles = useDatasetRole()
  const searchParams = useSearchParams()
  const page = searchParams.get('page') ?? '1'
  const pageSize = searchParams.get('pageSize') ?? ROWS_PAGE_SIZE
  const selectedRowId = Number(searchParams.get('rowId') ?? 0) || undefined
  const {
    data: rows,
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
    [page, pageSize, dataset.id, count],
  )
  const selectedRow = useMemo(
    () => rows.find((row) => row.id === selectedRowId),
    [rows, selectedRowId],
  )
  const props = {
    dataset,
    rows,
    selectedRow,
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
      description={
        dataset.deletedAt ? (
          <DeletedDatasetAlert deletedAt={dataset.deletedAt} />
        ) : undefined
      }
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
          <Button
            variant='outline'
            fancy
            onClick={onClick}
            disabled={isCreating}
          >
            {isCreating ? 'Creating...' : 'Create a row'}
          </Button>
        </>
      }
      table={
        <>
          {rows.length > 0 ? (
            <DataGrid
              {...props}
              updateRows={updateRows}
              deleteRows={deleteRows}
              isDeleting={isDeleting}
            />
          ) : (
            <DatasetBlankSlate onClick={onClick} isCreating={isCreating} />
          )}
        </>
      }
    />
  )
}
