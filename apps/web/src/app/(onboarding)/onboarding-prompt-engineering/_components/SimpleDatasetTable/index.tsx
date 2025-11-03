import { TableSkeleton } from '@latitude-data/web-ui/molecules/TableSkeleton'
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from '@latitude-data/web-ui/atoms/Table'
import useDatasetRows from '$/stores/datasetRows'
import { useMemo } from 'react'
import useDatasets from '$/stores/datasets'
import { Dataset } from '@latitude-data/core/schema/models/types/Dataset'

export default function SimpleDatasetTable({
  numberOfRows,
  onlyShowSkeleton = false,
  documentParameters,
  latestDataset,
}: {
  numberOfRows: number
  onlyShowSkeleton?: boolean
  documentParameters: string[]
  latestDataset?: Dataset
}) {
  const { generateIsLoading, isLoading: isLoadingDatasets } = useDatasets()

  const { data: rows, isLoading: isLoadingRows } = useDatasetRows({
    dataset: latestDataset,
    pageSize: numberOfRows.toString(),
  })

  const onboardingDatasetColumns = useMemo(() => {
    return latestDataset?.columns ?? []
  }, [latestDataset])

  const isLoadingDataset = useMemo(() => {
    return generateIsLoading || isLoadingRows || isLoadingDatasets
  }, [generateIsLoading, isLoadingRows, isLoadingDatasets])

  if (isLoadingDataset || onlyShowSkeleton) {
    return (
      <div className='absolute inset-x-0 bottom-[-7.5rem] h-full w-full bg-background'>
        <TableSkeleton rows={6} cols={documentParameters} maxHeight={320} />
        <div className='pointer-events-none absolute inset-x-0 bottom-0 h-full bg-gradient-to-t from-background via-background/80 to-transparent' />
      </div>
    )
  }

  return (
    <div className='absolute inset-x-0 bottom-[-7.5rem] h-full w-full bg-background'>
      <Table>
        <TableHeader>
          <TableRow hoverable={false}>
            {documentParameters.map((parameter) => (
              <TableHead key={parameter}>{parameter}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows?.map((row) => (
            <TableRow key={row.id} hoverable={false}>
              {onboardingDatasetColumns?.map((column) => (
                <TableCell key={column.identifier} className='py-2'>
                  {row.processedRowData[column.identifier] ?? ''}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <div className='pointer-events-none absolute inset-x-0 bottom-0 h-full bg-gradient-to-t from-background via-background/80 to-transparent' />
    </div>
  )
}
