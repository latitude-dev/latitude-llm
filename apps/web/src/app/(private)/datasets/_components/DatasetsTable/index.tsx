'use client'
import { LinkableTablePaginationFooter } from '$/components/TablePaginationFooter'
import { useToggleModal } from '$/hooks/useToogleModal'
import { ROUTES } from '$/services/routes'
import useDatasets from '$/stores/datasets'
import { Dataset } from '@latitude-data/core/browser'
import { buildPagination } from '@latitude-data/core/lib/pagination/buildPagination'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@latitude-data/web-ui/atoms/Table'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { dateFormatter } from '@latitude-data/web-ui/dateUtils'
import { TableBlankSlate } from '@latitude-data/web-ui/molecules/TableBlankSlate'
import { useSearchParams } from 'next/navigation'
import { useState } from 'react'

import { useNavigate } from '$/hooks/useNavigate'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import DeleteDatasetModal from '../DeleteDatasetModal'
import { NewDatasetModal } from '../RootHeader/NewDatasetModal'

export const DATASET_TABLE_PAGE_SIZE = '25'
export function DatasetsTable({
  datasets: serverDatasets,
}: {
  datasets: Dataset[]
}) {
  const navigate = useNavigate()
  const searchParams = useSearchParams()
  const page = searchParams.get('page') ?? '1'
  const pageSize = searchParams.get('pageSize') ?? DATASET_TABLE_PAGE_SIZE
  const newDataset = useToggleModal()
  const [deletable, setDeletable] = useState<Dataset | null>(null)
  const { data: datasets } = useDatasets(
    { page, pageSize },
    {
      fallbackData: serverDatasets,
    },
  )

  if (!datasets.length) {
    const isFirstPage = page === '1'
    const msg = isFirstPage
      ? 'There are no datasets yet. Create one to start testing your prompts.'
      : 'No more datasets to show.'
    return (
      <>
        <TableBlankSlate
          description={msg}
          link={
            <>
              {isFirstPage ? (
                <TableBlankSlate.Button onClick={newDataset.onOpen}>
                  Create your first dataset
                </TableBlankSlate.Button>
              ) : null}
            </>
          }
        />
        <NewDatasetModal
          open={newDataset.open}
          onOpenChange={newDataset.onOpenChange}
        />
      </>
    )
  }

  return (
    <>
      <DeleteDatasetModal
        dataset={deletable}
        setDataset={setDeletable}
        page={page}
        pageSize={pageSize}
      />
      <Table
        wrapperClassName='mb-8'
        externalFooter={
          <LinkableTablePaginationFooter
            pagination={buildPagination({
              count: Infinity,
              baseUrl: ROUTES.datasets.root(),
              page: Number(page),
              pageSize: Number(pageSize),
            })}
          />
        }
      >
        <TableHeader>
          <TableRow verticalPadding>
            <TableHead>Name</TableHead>
            <TableHead>Columns</TableHead>
            <TableHead>Author</TableHead>
            <TableHead>Created at</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {datasets.map((dataset) => (
            <TableRow
              key={dataset.id}
              verticalPadding
              className='cursor-pointer'
              onClick={() => navigate.push(ROUTES.datasets.detail(dataset.id))}
            >
              <TableCell>
                <Text.H5>{dataset.name}</Text.H5>
              </TableCell>
              <TableCell>
                <Text.H5>{dataset.columns.length}</Text.H5>
              </TableCell>
              <TableCell>
                <Text.H5>{dataset.author?.name}</Text.H5>
              </TableCell>
              <TableCell>
                <Text.H5 color='foregroundMuted'>
                  {dateFormatter.formatDate(dataset.createdAt)}
                </Text.H5>
              </TableCell>
              <TableCell align='center'>
                <div className='flex flex-row items-center gap-4'>
                  <Icon name='eye' color='foregroundMuted' />
                  <Button
                    onClick={(event) => {
                      event.stopPropagation()
                      setDeletable(dataset)
                    }}
                    variant='nope'
                    iconProps={{ name: 'trash', color: 'foregroundMuted' }}
                  />
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </>
  )
}
