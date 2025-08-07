import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@latitude-data/web-ui/atoms/Table'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import type { Column } from '@latitude-data/core/schema'

export function PreviewTable({ rows, headers }: { rows: string[][]; headers: Column[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          {headers.map((header, index) => (
            <TableHead key={index}>
              <Text.H5>{header.name}</Text.H5>
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((cells, i) => (
          <TableRow key={i} hoverable={false}>
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
