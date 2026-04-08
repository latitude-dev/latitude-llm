import { useMemo } from "react"

import { Skeleton } from "../skeleton/skeleton.tsx"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, type TableVariant } from "../table/table.tsx"

function TableSkeleton({
  rows,
  cols,
  maxHeight,
  verticalPadding = false,
  animate = true,
  variant = "default",
}: {
  rows: number
  cols: string[] | number
  maxHeight?: number
  verticalPadding?: boolean
  animate?: boolean
  variant?: TableVariant
}) {
  const { data, headers } = useMemo(() => {
    const headers = typeof cols === "number" ? Array.from(Array(cols).keys()) : cols
    const data = Array.from({ length: rows }, (_, i) => ({ id: `row-${i}`, cells: headers }))
    return { data, headers }
  }, [rows, cols])

  return (
    <Table variant={variant} {...(maxHeight !== undefined ? { maxHeight } : {})} overflow="overflow-hidden">
      <TableHeader>
        <TableRow hoverable={false}>
          {headers.map((header) => (
            <TableHead key={header}>
              {typeof header === "string" ? header : <Skeleton className="h-4 w-20" />}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.map((row) => (
          <TableRow key={row.id} verticalPadding={verticalPadding} hoverable={false}>
            {row.cells.map((cell) => (
              <TableCell key={cell} {...(variant === "default" ? { className: "py-2" } : {})}>
                <Skeleton className="h-4 w-full" animate={animate} />
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

export { TableSkeleton }
