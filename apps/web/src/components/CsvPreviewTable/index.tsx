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

interface CsvPreviewTableProps {
  csvData: CsvData
}

export function CsvPreviewTable({ csvData }: CsvPreviewTableProps) {
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
        {csvData.data.map(({ record }, rowIndex) => (
          <TableRow key={rowIndex} hoverable={false}>
            {csvData.headers.map((header, cellIndex) => (
              <TableCell key={cellIndex}>
                <div className='py-1'>
                  <Text.H5>{record[header]}</Text.H5>
                </div>
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
