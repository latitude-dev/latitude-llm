import { Dataset } from '@latitude-data/core/browser'

import '@latitude-data/web-ui'

import {
  Button,
  Modal,
  ModalTrigger,
  ReactStateDispatch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableSkeleton,
  Text,
} from '@latitude-data/web-ui'
import useDatasetPreview from '$/stores/datasetPreviews'

const VISIBLE_ROWS = 20
function PreviewModal({
  dataset,
  setPreview,
}: {
  dataset: Dataset
  setPreview: ReactStateDispatch<Dataset | null>
}) {
  const { data, isLoading } = useDatasetPreview({ dataset })
  const rows = data?.rows ?? []
  const rowCount = Math.min(dataset.fileMetadata.rowCount, VISIBLE_ROWS)
  return (
    <Modal
      size='large'
      open
      title={`${dataset.name} preview`}
      description='First 100 rows of the dataset'
      onOpenChange={(open: boolean) => !open && setPreview(null)}
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
          rows={rowCount}
          cols={dataset.fileMetadata.headers.length}
        />
      ) : (
        <Table maxHeight={450}>
          <TableHeader>
            <TableRow verticalPadding>
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
                <TableRow key={rowIndex} verticalPadding>
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
  setPreview,
}: {
  dataset: Dataset | null
  setPreview: ReactStateDispatch<Dataset | null>
}) {
  if (!dataset) return null

  return <PreviewModal dataset={dataset} setPreview={setPreview} />
}
