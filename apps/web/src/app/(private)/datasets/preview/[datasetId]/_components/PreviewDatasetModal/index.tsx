'use client'

import { Dataset } from '@latitude-data/core/browser'

import '@latitude-data/web-ui'

import {
  Button,
  Modal,
  ModalTrigger,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableSkeleton,
  Text,
} from '@latitude-data/web-ui'
import { useNavigate } from '$/hooks/useNavigate'
import { ROUTES } from '$/services/routes'
import useDatasetPreview from '$/stores/datasetPreviews'

const VISIBLE_ROWS = 20
const TABLE_MAX_HEIGHT = 450
function PreviewModal({ dataset }: { dataset: Dataset }) {
  const navigate = useNavigate()
  const { data, isLoading } = useDatasetPreview({ dataset })
  const rows = data?.rows ?? []
  const rowCount = Math.min(dataset.fileMetadata.rowCount, VISIBLE_ROWS)
  return (
    <Modal
      size='large'
      open
      title={`${dataset.name} preview`}
      description='First 100 rows of the dataset'
      onOpenChange={(open: boolean) =>
        !open && navigate.push(ROUTES.datasets.root)
      }
      footer={
        <ModalTrigger asChild>
          <Button fancy variant='outline'>
            Go back
          </Button>
        </ModalTrigger>
      }
    >
      {isLoading ? (
        <TableSkeleton
          maxHeight={TABLE_MAX_HEIGHT}
          rows={rowCount}
          cols={dataset.fileMetadata.headers.length}
        />
      ) : (
        <Table maxHeight={TABLE_MAX_HEIGHT}>
          <TableHeader>
            <TableRow verticalPadding hoverable={false}>
              <TableHead>
                <Text.H4>#</Text.H4>
              </TableHead>
              {data.headers.map((header, i) => (
                <TableHead key={`${header}-${i}`}>
                  <Text.H4>{header}</Text.H4>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, rowIndex) => {
              return (
                <TableRow key={rowIndex} verticalPadding hoverable={false}>
                  {row.map((cell, cellIndex) => (
                    <TableCell key={cellIndex}>{cell}</TableCell>
                  ))}
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      )}
    </Modal>
  )
}

export default function PreviewDatasetModal({
  dataset,
}: {
  dataset: Dataset | null
}) {
  if (!dataset) return null

  return <PreviewModal dataset={dataset} />
}
