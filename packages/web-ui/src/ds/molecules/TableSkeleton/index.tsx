import { useMemo } from 'react'

import { Skeleton } from '../../atoms'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../atoms/Table'
import Text from '../../atoms/Text'

export function TableSkeleton({
  rows,
  cols,
  maxHeight,
}: {
  rows: number
  cols: number
  maxHeight?: number
}) {
  const { data, headers } = useMemo(() => {
    const rowList = Array.from(Array(rows).keys())
    const headers = Array.from(Array(cols).keys())
    const data = rowList.map((_) => headers)
    return { data, headers }
  }, [rows, cols])
  return (
    <Table maxHeight={maxHeight}>
      <TableHeader>
        <TableRow>
          {headers.map((header) => (
            <TableHead key={header}>
              <Skeleton>
                <div className='opacity-0'>
                  <Text.H4>{header}</Text.H4>
                </div>
              </Skeleton>
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.map((row, indexRow) => (
          <TableRow key={indexRow} verticalPadding>
            {row.map((cell) => (
              <TableCell key={cell}>
                <Skeleton className='w-full'>
                  <div className='opacity-0'>{row}</div>
                </Skeleton>
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
