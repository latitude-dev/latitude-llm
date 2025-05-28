import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@latitude-data/web-ui/atoms/Table'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { TableSkeleton } from '@latitude-data/web-ui/molecules/TableSkeleton'
import { cn } from '@latitude-data/web-ui/utils'
import { Column } from '@latitude-data/core/schema'
import { useDatasetRole } from '$/hooks/useDatasetRoles'
import { DatasetHeadText } from '$/app/(private)/datasets/_components/DatasetHeadText'
import { OutputItem } from '$/stores/previewLogs'
import { useCallback } from 'react'

function PreviewCell({
  cell,
  column,
  lineClamp,
  oldData = false,
  className,
}: {
  cell: string
  column: Column
  lineClamp: 1 | 3
  oldData?: boolean
  className?: string
}) {
  const { backgroundCssClasses } = useDatasetRole()
  return (
    <TableCell
      verticalBorder
      className={cn(backgroundCssClasses[column.role], className)}
    >
      <Text.H5
        color={oldData ? 'foregroundMuted' : 'foreground'}
        wordBreak='breakAll'
        ellipsis
        lineClamp={lineClamp}
      >
        <div className={cn({ 'opacity-40': oldData })}>{cell}</div>
      </Text.H5>
    </TableCell>
  )
}

export function PreviewTable({
  selectedCount,
  previewData,
  previewStaticColumns,
  previewParameterColumns,
  onSelectStaticColumn,
  onSelectParameterColumn,
  selectable = false,
  isLoading,
  subtitle,
}: {
  selectedCount: number
  previewData: OutputItem
  isLoading: boolean
  subtitle?: string
  previewStaticColumns?: Map<string, boolean>
  previewParameterColumns?: Map<string, boolean>
  selectable?: boolean
  onSelectStaticColumn?: (column: string) => void
  onSelectParameterColumn?: (column: string) => void
}) {
  const isColumnDisabled = (column: Column) => {
    if (!selectable) return false
    if (column.role === 'parameter') {
      return !previewParameterColumns?.get(column.name)
    } else if (column.role === 'label' || column.role === 'metadata') {
      return !previewStaticColumns?.get(column.name)
    }
  }

  const handleColumnClick = useCallback(
    (column: Column) => {
      if (column.role === 'parameter') {
        onSelectParameterColumn?.(column.name)
      } else if (column.role === 'label' || column.role === 'metadata') {
        onSelectStaticColumn?.(column.name)
      }
    },
    [onSelectParameterColumn, onSelectStaticColumn],
  )

  const { backgroundCssClasses } = useDatasetRole()
  return (
    <div className='flex flex-col gap-y-2'>
      <Text.H4>Logs preview</Text.H4>
      {subtitle && <Text.H6 color='foregroundMuted'>{subtitle}</Text.H6>}
      {isLoading ? (
        <TableSkeleton rows={10} cols={5} maxHeight={320} />
      ) : (
        <Table>
          <TableHeader>
            <TableRow verticalPadding>
              {previewData.columns.map((column) => {
                return (
                  <TableHead
                    verticalBorder
                    key={column.identifier}
                    className={cn(
                      'select-none transition-all',
                      backgroundCssClasses[column.role],
                      isColumnDisabled(column) && 'opacity-20',
                      selectable && 'cursor-pointer',
                    )}
                    onClick={() => selectable && handleColumnClick(column)}
                  >
                    <DatasetHeadText text={column.name} role={column.role} />
                  </TableHead>
                )
              })}
            </TableRow>
          </TableHeader>
          <TableBody className='relative'>
            {previewData.datasetRows.map((cells, index) => (
              <TableRow
                key={index}
                verticalPadding
                hoverable={false}
                className='relative'
              >
                {cells.map((cell, index) => (
                  <PreviewCell
                    oldData
                    key={index}
                    cell={cell}
                    lineClamp={1}
                    column={previewData.columns[index]!}
                  />
                ))}
              </TableRow>
            ))}
            <tr>
              <td className='p-0'>
                <div className='absolute inset-0 bg-gradient-to-b from-background to-transparent pointer-events-none' />
              </td>
            </tr>
          </TableBody>
          <TableBody>
            {previewData.previewRows.map((cells, index) => (
              <TableRow key={index} verticalPadding hoverable={false}>
                {cells.map((cell, index) => (
                  <PreviewCell
                    key={index}
                    cell={cell}
                    lineClamp={1}
                    column={previewData.columns[index]!}
                    className={cn(
                      'transition-opacity',
                      isColumnDisabled(previewData.columns[index]!) &&
                        'opacity-20',
                    )}
                  />
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  )
}
