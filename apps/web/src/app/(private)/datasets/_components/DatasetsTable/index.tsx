'use client'

import { useState } from 'react'
import { compact } from 'lodash-es'

import { Dataset } from '@latitude-data/core/browser'
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
  Tooltip,
} from '@latitude-data/web-ui'
import DeleteDatasetModal from '$/app/(private)/datasets/_components/DeleteDatasetModal'
import { useNavigate } from '$/hooks/useNavigate'
import { ROUTES } from '$/services/routes'
import useDatasets from '$/stores/datasets'
import Link from 'next/link'

export function DatasetsTable({
  datasets: serverDatasets,
}: {
  datasets: Dataset[]
}) {
  const navigate = useNavigate()
  const [deletable, setDeletable] = useState<Dataset | null>(null)
  const { data: datasets } = useDatasets(undefined, {
    fallbackData: serverDatasets,
  })
  if (!datasets.length) {
    return (
      <TableBlankSlate
        description='There are no datasets yet. Create one to start testing your prompts.'
        link={
          <Link href={ROUTES.datasets.new.root}>
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
                <Text.H5>{dataset.fileMetadata.rowCount}</Text.H5>
              </TableCell>
              <TableCell>
                <Text.H5>{dataset.fileMetadata.headers.length}</Text.H5>
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
                  <Tooltip
                    trigger={
                      <Button
                        onClick={() =>
                          navigate.push(ROUTES.datasets.preview(dataset.id))
                        }
                        variant='nope'
                        iconProps={{ name: 'eye', color: 'foregroundMuted' }}
                      />
                    }
                  >
                    Show file preview (first 100 rows)
                  </Tooltip>
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
