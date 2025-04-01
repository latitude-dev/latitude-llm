'use client'
import { useState } from 'react'
import { compact } from 'lodash-es'
import Link from 'next/link'

import { Dataset } from '@latitude-data/core/browser'
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
import { Tooltip } from '@latitude-data/web-ui/atoms/Tooltip'
import { useNavigate } from '$/hooks/useNavigate'
import { ROUTES } from '$/services/routes'
import useDatasets from '$/stores/datasets'
import DeleteDatasetModal from '../DeleteDatasetModal'
import { useFeatureFlag } from '$/components/Providers/FeatureFlags'

export function DatasetsTable({
  datasets: serverDatasets,
}: {
  datasets: Dataset[]
}) {
  const { enabled: canNotModifyDatasets } = useFeatureFlag({
    featureFlag: 'datasetsV1ModificationBlocked',
  })
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
          <Link href={ROUTES.datasets.root({ modal: 'new' })}>
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
                    asChild
                    trigger={
                      <Button
                        onClick={() =>
                          navigate.push(ROUTES.datasets.detail(dataset.id))
                        }
                        variant='nope'
                        iconProps={{ name: 'eye', color: 'foregroundMuted' }}
                      />
                    }
                  >
                    Show file preview (first 100 rows)
                  </Tooltip>
                  <Button
                    disabled={canNotModifyDatasets}
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
