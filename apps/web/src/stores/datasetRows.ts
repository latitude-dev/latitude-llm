import type { DatasetRow, DatasetV2 } from '@latitude-data/core/browser'
import useFetcher from '$/hooks/useFetcher'
import { compact, omit } from 'lodash-es'
import { ROUTES } from '$/services/routes'
import useSWR, { SWRConfiguration } from 'swr'
import { compactObject } from '@latitude-data/core/lib/compactObject'
import { DatasetRowData } from '@latitude-data/core/schema'

export type ClientDatasetRow = Omit<DatasetRow, 'rowData'> & {
  cells: DatasetRowData[keyof DatasetRowData][]
}
export function buildDatasetRowKey({
  datasetId,
  page,
  pageSize,
}: {
  datasetId: number
  page?: string | null | undefined
  pageSize?: string | null
}) {
  return compact([
    'datasetRows',
    datasetId,
    page ? +page : undefined,
    pageSize ? +pageSize : undefined,
  ])
}

export default function useDatasetRows(
  {
    dataset,
    page,
    pageSize,
    onFetched,
  }: {
    dataset: DatasetV2
    page?: string | null | undefined
    pageSize?: string | null
    onFetched?: (datasets: ClientDatasetRow[]) => void
  },
  opts?: SWRConfiguration,
) {
  const fetcher = useFetcher(ROUTES.api.datasetsRows.root, {
    serializer: serializeRows(dataset.columns),
    searchParams: compactObject({
      datasetId: dataset.id,
      page: page ? String(page) : undefined,
      pageSize: pageSize ? String(pageSize) : undefined,
    }) as Record<string, string>,
  })
  const {
    data = [],
    mutate,
    ...rest
  } = useSWR<ClientDatasetRow[]>(
    buildDatasetRowKey({ datasetId: dataset.id, page, pageSize }),
    fetcher,
    {
      ...opts,
      fallbackData: opts?.fallbackData
        ? serializeRows(dataset.columns)(opts.fallbackData)
        : undefined,
      onSuccess: (data) => {
        onFetched?.(data)
      },
    },
  )

  return {
    data,
    mutate,
    ...rest,
  }
}

export const serializeRows =
  (columns: DatasetV2['columns']) =>
  (rows: DatasetRow[]): ClientDatasetRow[] => {
    return rows.map((item) => {
      const rest = omit(item, 'rowData') as Omit<DatasetRow, 'rowData'>
      return {
        ...rest,
        cells: columns.map(
          ({ identifier }) => item.rowData[identifier] ?? null,
        ),
        createdAt: new Date(item.createdAt),
        updatedAt: new Date(item.updatedAt),
      }
    })
  }
