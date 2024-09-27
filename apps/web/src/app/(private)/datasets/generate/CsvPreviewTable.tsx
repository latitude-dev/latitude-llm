import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Text,
} from '@latitude-data/web-ui'

interface CsvPreviewTableProps {
  csvData: {
    headers: string[]
    data: {
      record: Record<string, string>
      info: { columns: { name: string }[] }
    }[]
  }
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
