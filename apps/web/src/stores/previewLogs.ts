import useFetcher from '$/hooks/useFetcher'
import { ROUTES } from '$/services/routes'
import { Dataset, parseRowCell } from '@latitude-data/core/browser'
import { compactObject } from '@latitude-data/core/lib/compactObject'
import { DatasetRowData } from '@latitude-data/core/schema'
import useSWR, { SWRConfiguration } from 'swr'

type InputItem = {
  columns: Dataset['columns']
  existingRows: DatasetRowData[]
  newRows: DatasetRowData[]
}

export type OutputItem = {
  columns: Dataset['columns']
  datasetRows: string[][]
  previewRows: string[][]
}

function serializeRowData(rowData: DatasetRowData): string[] {
  const keys = Object.keys(rowData)
  return keys.map((key) => {
    const cell = rowData[key]
    return parseRowCell({ cell })
  })
}

function serializeRows(item: InputItem): OutputItem {
  const columns = item.columns
  return {
    columns,
    datasetRows: item.existingRows.map(serializeRowData),
    previewRows: item.newRows.map(serializeRowData),
  }
}

const EMPTY_DATA = {
  columns: [] as Dataset['columns'],
  datasetRows: [] as string[][],
  previewRows: [] as string[][],
}

export function usePreviewLogs(
  {
    dataset,
    documentLogIds,
    staticColumnNames,
    parameterColumnNames,
  }: {
    dataset?: Dataset
    documentLogIds: (string | number)[]
    staticColumnNames?: string[]
    parameterColumnNames?: string[]
  },
  opts?: SWRConfiguration,
) {
  const fetcher = useFetcher(ROUTES.api.datasets.previewLogs.root, {
    serializer: serializeRows,
    searchParams: compactObject({
      name: dataset?.name,
      documentLogIds,
      staticColumnNames,
      parameterColumnNames,
    }) as Record<string, string>,
  })
  const cacheKey = [
    'previewLogsForDataset',
    dataset?.id ?? 'no_dataset',
    documentLogIds,
    staticColumnNames,
    parameterColumnNames,
  ]
  const {
    data = EMPTY_DATA,
    mutate: fetchPreview,
    isLoading,
  } = useSWR<OutputItem>(cacheKey, fetcher, {
    ...opts,
  })

  return { previewData: data, fetchPreview, isLoading }
}
