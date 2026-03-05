import { useMemo } from "react"

import { Skeleton } from "../skeleton/skeleton.tsx"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../table/table.tsx"

function TableSkeleton({
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
    const headers = typeof cols === "number" ? Array.from(Array(cols).keys()) : cols
    const data = Array.from({ length: rows }, (_, i) => ({ id: `row-${i}`, cells: headers }))
    return { data, headers }
  }, [rows, cols])

  return (
    <Table {...(maxHeight !== undefined ? { maxHeight } : {})} overflow="overflow-hidden">
      <TableHeader>
        <TableRow hoverable={false}>
          {headers.map((header) => (
            <TableHead key={header}>
              {typeof header === "string" ? header : <Skeleton className="w-20 h-4" />}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.map((row) => (
          <TableRow key={row.id} verticalPadding={verticalPadding} hoverable={false}>
            {row.cells.map((cell) => (
              <TableCell key={cell} className="py-2">
                <Skeleton className="w-full h-4" animate={animate} />
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

export { TableSkeleton }
