'use client'
import { useState } from 'react'
import Link from 'next/link'
import { DatasetV2 } from '@latitude-data/core/browser'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { dateFormatter } from '@latitude-data/web-ui/dateUtils'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@latitude-data/web-ui/atoms/Table'
import { TableBlankSlate } from '@latitude-data/web-ui/molecules/TableBlankSlate'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import useDatasets from '$/stores/datasetsV2'
import { useToggleModal } from '$/hooks/useToogleModal'
import { useSearchParams } from 'next/navigation'
import { buildPagination } from '@latitude-data/core/lib/pagination/buildPagination'
import { ROUTES } from '$/services/routes'
import { LinkableTablePaginationFooter } from '$/components/TablePaginationFooter'

import DeleteDatasetModal from '../DeleteDatasetModal'
import { NewDatasetModal } from '../RootHeader/NewDatasetModal'

export function DatasetsTable({
  datasets: serverDatasets,
}: {
  datasets: DatasetV2[]
}) {
  const searchParams = useSearchParams()
  const page = searchParams.get('page') ?? '1'
  const pageSize = searchParams.get('pageSize') ?? '25'
  const newDataset = useToggleModal()
  const [deletable, setDeletable] = useState<DatasetV2 | null>(null)
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
      <DeleteDatasetModal dataset={deletable} setDataset={setDeletable} />
      <Table
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
            <TableRow key={dataset.id} verticalPadding hoverable={false}>
              <TableCell>
                <Link href={ROUTES.datasets.detail(dataset.id)}>
                  <Text.H5>{dataset.name}</Text.H5>
                </Link>
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
                <div className='flex flex-row gap-4'>
                  <Link href={ROUTES.datasets.detail(dataset.id)}>
                    <Button
                      variant='nope'
                      iconProps={{ name: 'eye', color: 'foregroundMuted' }}
                    />
                  </Link>
                  <Button
                    onClick={() => setDeletable(dataset)}
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
