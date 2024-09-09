'use client'

import { useState } from 'react'

import { Dataset } from '@latitude-data/core/browser'
import {
  Button,
  dateFormatter,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Text,
} from '@latitude-data/web-ui'
import DeleteDatasetModal from '$/app/(private)/datasets/_components/DeleteDatasetModal'
import useDatasets from '$/stores/datasets'

export function DatasetsTable({
  datasets: serverDatasets,
}: {
  datasets: Dataset[]
}) {
  const [deletable, setDeletable] = useState<Dataset | null>(null)
  const { data: datasets } = useDatasets(undefined, {
    fallbackData: serverDatasets,
  })
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
          {datasets.map((dataset) => (
            <TableRow key={dataset.id} verticalPadding>
              <TableCell>
                <Text.H4>{dataset.name}</Text.H4>
              </TableCell>
              <TableCell>
                <Text.H4>{dataset.fileMetadata.rowCount}</Text.H4>
              </TableCell>
              <TableCell>
                <Text.H4>{dataset.fileMetadata.headers.length}</Text.H4>
              </TableCell>
              <TableCell>
                <Text.H4>{dataset.author?.name}</Text.H4>
              </TableCell>
              <TableCell>
                <Text.H4 color='foregroundMuted'>
                  {dateFormatter.formatDate(dataset.createdAt)}
                </Text.H4>
              </TableCell>
              <TableCell align='center'>
                <Button
                  onClick={() => setDeletable(dataset)}
                  variant='nope'
                  iconProps={{ name: 'trash', color: 'destructive' }}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </>
  )
}
