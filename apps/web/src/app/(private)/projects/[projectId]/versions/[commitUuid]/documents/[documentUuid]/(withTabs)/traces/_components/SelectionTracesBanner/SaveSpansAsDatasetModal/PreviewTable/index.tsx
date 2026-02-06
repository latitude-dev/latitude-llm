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
import { type OutputItem } from '../useSelectedSpans'
import { Column } from '@latitude-data/core/schema/models/datasets'
import { useDatasetRole } from '$/hooks/useDatasetRoles'
import { DatasetHeadText } from '$/app/(private)/datasets/_components/DatasetHeadText'
import { SelectionMode } from '$/hooks/useSelectableRows'

function PreviewCell({
  cell,
  column,
  lineClamp,
  oldData = false,
}: {
  cell: string
  column: Column
  lineClamp: 1 | 3
  oldData?: boolean
}) {
  const { backgroundCssClasses } = useDatasetRole()
  return (
    <TableCell verticalBorder className={backgroundCssClasses[column.role]}>
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

function getDescriptionText({
  previewRowCount,
  selectionMode,
  isExistingDataset,
}: {
  previewRowCount: number
  selectionMode: SelectionMode
  isExistingDataset: boolean
}) {
  const datasetText = isExistingDataset ? 'the dataset' : 'a new dataset'
  const note =
    'Only the initial prompt span from each conversation is included in datasets.'

  if (selectionMode === 'ALL') {
    return `All matching prompt spans will be added to ${datasetText}. ${note}`
  }

  if (selectionMode === 'ALL_EXCEPT') {
    return `All matching prompt spans (except excluded) will be added to ${datasetText}. ${note}`
  }

  return `${previewRowCount} prompt spans will be added to ${datasetText}. ${note}`
}

export function PreviewTable({
  selectionMode,
  previewData,
  isLoading,
}: {
  selectionMode: SelectionMode
  previewData: OutputItem
  isLoading: boolean
}) {
  const { backgroundCssClasses } = useDatasetRole()
  const isExistingDataset = previewData.datasetRows.length > 0
  const description = getDescriptionText({
    previewRowCount: previewData.previewRows.length,
    selectionMode,
    isExistingDataset,
  })
  return (
    <div className='flex flex-col gap-y-2'>
      <Text.H4>Spans preview</Text.H4>
      <Text.H6 color='foregroundMuted'>{description}</Text.H6>
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
                    className={backgroundCssClasses[column.role]}
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
