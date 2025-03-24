'use client'

import { Dataset } from '@latitude-data/core/browser'

import '@latitude-data/web-ui'

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableSkeleton,
  TableWithHeader,
  Text,
} from '@latitude-data/web-ui'
import useDatasetPreview from '$/stores/datasetPreviews'

const VISIBLE_ROWS = 20
const TABLE_MAX_HEIGHT = 450

export function DatasetV1DetailTable({ dataset }: { dataset: Dataset }) {
  const { data, isLoading } = useDatasetPreview({ dataset })
  const rows = data?.rows ?? []
  const rowCount = Math.min(dataset.fileMetadata.rowCount, VISIBLE_ROWS)

  return (
    <TableWithHeader
      title={dataset.name}
      table={
        <>
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
                    <Text.H5>#</Text.H5>
                  </TableHead>
                  {data.headers.map((header, i) => (
                    <TableHead key={`${header}-${i}`}>
                      <Text.H5>{header}</Text.H5>
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
        </>
      }
    />
  )
}
