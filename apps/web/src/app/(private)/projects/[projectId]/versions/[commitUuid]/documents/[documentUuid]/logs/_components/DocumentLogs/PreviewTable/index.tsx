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
import { useDatasetRole } from '$/hooks/useDatasetRoles'
import { DatasetHeadText } from '$/app/(private)/datasets/_components/DatasetHeadText'
import { ColumnSelector } from './ColumnSelector'
import { Column } from '@latitude-data/core/schema'
import { OutputItem } from './usePreviewTable'

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
  previewData,
  onSelectColumn,
  isColumnSelected,
  selectable = false,
  isLoading,
  subtitle,
}: {
  previewData: OutputItem
  onSelectColumn: (column: Column) => void
  isColumnSelected: (column: Column) => boolean
  selectable?: boolean
  isLoading: boolean
  subtitle?: string
}) {
  const { backgroundCssClasses } = useDatasetRole()
  return (
    <div className='flex flex-col gap-y-4'>
      <div className='w-full flex justify-between items-center'>
        <div className='flex flex-col gap-y-2'>
          <Text.H4>Logs preview</Text.H4>
          {subtitle && <Text.H6 color='foregroundMuted'>{subtitle}</Text.H6>}
        </div>
        {selectable && (
          <ColumnSelector
            columns={previewData.columns}
            onSelectColumn={onSelectColumn}
            isColumnSelected={isColumnSelected}
          />
        )}
      </div>
      {isLoading ? (
        <TableSkeleton rows={10} cols={5} maxHeight={320} />
      ) : (
        <Table>
          <TableHeader>
            <TableRow verticalPadding hoverable={false}>
              {previewData.columns.map((column) => {
                return (
                  <TableHead
                    verticalBorder
                    key={column.identifier}
                    className={cn(
                      backgroundCssClasses[column.role],
                      selectable &&
                        !isColumnSelected(column) &&
                        ' transition-allopacity-20',
                    )}
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
                      selectable &&
                        !isColumnSelected(previewData.columns[index]!) &&
                        'transition-opacity opacity-20',
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
