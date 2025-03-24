import { DatasetHeadText } from '$/app/(private)/datasets/_components/DatasetHeadText'
import {
  dateFormatter,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Text,
} from '@latitude-data/web-ui'
import { LinkableTablePaginationFooter } from '$/components/TablePaginationFooter'
import { DatasetRowsTableProps } from '../DataGrid'

export function SimpleTable({
  dataset,
  rows,
  pagination,
  datasetCellRoleStyles,
}: DatasetRowsTableProps) {
  const { backgroundCssClasses } = datasetCellRoleStyles
  return (
    <Table
      externalFooter={<LinkableTablePaginationFooter pagination={pagination} />}
    >
      <TableHeader>
        <TableRow verticalPadding>
          {dataset.columns.map((column) => (
            <TableHead
              verticalBorder
              key={column.identifier}
              className={backgroundCssClasses[column.role]}
            >
              <DatasetHeadText text={column.name} role={column.role} />
            </TableHead>
          ))}
          <TableHead className={backgroundCssClasses['metadata']}>
            Created at
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.id} verticalPadding hoverable={false}>
            {row.cells.map((cell, index) => {
              const role = dataset.columns[index]!.role
              return (
                <TableCell
                  verticalBorder
                  key={index}
                  className={backgroundCssClasses[role]}
                >
                  <Text.H5 wordBreak='breakAll' ellipsis lineClamp={1}>
                    {cell}
                  </Text.H5>
                </TableCell>
              )
            })}
            <TableCell className={backgroundCssClasses['metadata']}>
              <Text.H5 color='foregroundMuted'>
                {dateFormatter.formatDate(row.createdAt)}
              </Text.H5>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
