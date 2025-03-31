import { useMemo } from 'react'

import { Skeleton } from '../../atoms/Skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../atoms/Table'
import { Text } from '../../atoms/Text'

export function TableSkeleton({
  rows,
  cols,
  maxHeight,
  verticalPadding = false,
}: {
  rows: number
  cols: number
  maxHeight?: number
  verticalPadding?: boolean
}) {
  const { data, headers } = useMemo(() => {
    const rowList = Array.from(Array(rows).keys())
    const headers = Array.from(Array(cols).keys())
    const data = rowList.map((_) => headers)
    return { data, headers }
  }, [rows, cols])
  return (
    <Table maxHeight={maxHeight} overflow='overflow-hidden'>
      <TableHeader>
        <TableRow hoverable={false}>
          {headers.map((header) => (
            <TableHead key={header}>
              <Skeleton className='bg-white'>
                <div className='opacity-0 h-4'>
                  <Text.H4>{header}</Text.H4>
                </div>
              </Skeleton>
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.map((row, indexRow) => (
          <TableRow
            key={indexRow}
            verticalPadding={verticalPadding}
            hoverable={false}
          >
            {row.map((cell) => (
              <TableCell key={cell} className='py-2'>
                <Skeleton className='w-full h-4'>
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
