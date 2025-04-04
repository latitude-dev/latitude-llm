import { parseRowCell } from '$/stores/datasetRows/rowSerializationHelpers'
import { CsvData } from '@latitude-data/core/browser'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@latitude-data/web-ui/atoms/Table'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { useMemo } from 'react'

interface CsvPreviewTableProps {
  csvData: CsvData
}

export function CsvPreviewTable({ csvData }: CsvPreviewTableProps) {
  const headers = csvData.headers
  const rawData = csvData.data
  const parsedData = useMemo(() => {
    return rawData.map(({ record }) => {
      return headers.map((header) =>
        parseRowCell({ cell: record[header], parseDates: false }),
      )
    })
  }, [headers, rawData])
  return (
    <Table>
      <TableHeader>
        <TableRow>
          {csvData.headers.map((header, index) => (
            <TableHead key={index}>
              <Text.H5>{header}</Text.H5>
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {parsedData.map((cells, rowIndex) => (
          <TableRow key={rowIndex} hoverable={false}>
            {cells.map((cell, cellIndex) => (
              <TableCell key={cellIndex}>
                <div className='py-1'>
                  <Text.H5>{cell}</Text.H5>
                </div>
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
