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

export default function SimpleDatasetTable({
  numberOfRows,
  onlyShowSkeleton = false,
  documentParameters,
}: {
  numberOfRows: number
  onlyShowSkeleton?: boolean
  documentParameters: string[]
}) {
  const { data: datasets, generateIsLoading } = useDatasets()
  const { data: rows } = useDatasetRows({
    dataset: datasets?.[0],
    pageSize: numberOfRows.toString(),
  })
  const onboardingDatasetColumns = useMemo(() => {
    return datasets?.[0]?.columns
  }, [datasets])

  if (generateIsLoading || onlyShowSkeleton) {
    return (
      <div className='absolute inset-x-0 bottom-[-10rem] h-full w-full p-4 bg-background'>
        <TableSkeleton rows={6} cols={documentParameters} maxHeight={320} />{' '}
        <div className='pointer-events-none absolute inset-x-0 bottom-0 h-full bg-gradient-to-t from-background via-background to-transparent' />
      </div>
    )
  }

  return (
    <div className='absolute inset-x-0 bottom-[-10rem] h-full w-full p-4 bg-background'>
      <Table>
        <TableHeader>
          <TableRow>
            {documentParameters.map((parameter) => (
              <TableHead key={parameter}>{parameter}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows?.map((row) => (
            <TableRow key={row.id}>
              {onboardingDatasetColumns?.map((column) => (
                <TableCell key={column.identifier}>
                  {row.processedRowData[column.identifier] ?? ''}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <div className='pointer-events-none absolute inset-x-0 bottom-0 h-full bg-gradient-to-t from-background via-background to-transparent' />
    </div>
  )
}
