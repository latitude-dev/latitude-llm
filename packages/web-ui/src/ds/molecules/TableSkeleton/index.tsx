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

export function TableSkeleton({
  rows,
  cols,
  maxHeight,
  verticalPadding = false,
  animate = true,
}: {
  rows: number
  cols: string[] | number
  maxHeight?: number
  verticalPadding?: boolean
  animate?: boolean
}) {
  const { data, headers } = useMemo(() => {
    const rowList = Array.from(Array(rows).keys())
    const headers =
      typeof cols === 'number' ? Array.from(Array(cols).keys()) : cols
    const data = rowList.map((_) => headers)
    return { data, headers }
  }, [rows, cols])
  return (
    <Table maxHeight={maxHeight} overflow='overflow-hidden'>
      <TableHeader>
        <TableRow hoverable={false}>
          {headers.map((header) => (
            <TableHead key={header}>
              {typeof header === 'string' ? (
                header
              ) : (
                <Skeleton className='w-20 h-4' />
              )}
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
                <Skeleton className='w-full h-4' animate={animate} />
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
