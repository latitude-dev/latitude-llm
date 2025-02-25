'use client'

import { useState } from 'react'
import { compact } from 'lodash-es'

import { DatasetV2 } from '@latitude-data/core/browser'
import {
  Button,
  dateFormatter,
  Table,
  TableBlankSlate,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Text,
} from '@latitude-data/web-ui'
import DeleteDatasetModal from '../DeleteDatasetModal'
import { ROUTES } from '$/services/routes'
import useDatasets from '$/stores/datasetsV2'
import Link from 'next/link'

export function DatasetsTable({
  datasets: serverDatasets,
}: {
  datasets: DatasetV2[]
}) {
  const [deletable, setDeletable] = useState<DatasetV2 | null>(null)
  const { data: datasets } = useDatasets(undefined, {
    fallbackData: serverDatasets,
  })
  if (!datasets.length) {
    return (
      <TableBlankSlate
        description='There are no datasets yet. Create one to start testing your prompts.'
        link={
          <Link href={ROUTES.datasetsV2.new.root}>
            <TableBlankSlate.Button>
              Create your first dataset
            </TableBlankSlate.Button>
          </Link>
        }
      />
    )
  }

  return (
    <>
      <DeleteDatasetModal dataset={deletable} setDataset={setDeletable} />
      <Table>
        <TableHeader>
          <TableRow verticalPadding>
            <TableHead>Name</TableHead>
            <TableHead>Rows</TableHead>
            <TableHead>Columns</TableHead>
            <TableHead>Author</TableHead>
            <TableHead>Created at</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {compact(datasets).map((dataset) => (
            <TableRow key={dataset.id} verticalPadding hoverable={false}>
              <TableCell>
                <Text.H5>{dataset.name}</Text.H5>
              </TableCell>
              <TableCell>
                <Text.H5>TODO Count</Text.H5>
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
