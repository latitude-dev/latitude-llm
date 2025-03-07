import type { DatasetRow, DatasetV2 } from '@latitude-data/core/browser'
import useFetcher from '$/hooks/useFetcher'
import { compact, omit } from 'lodash-es'
import { ROUTES } from '$/services/routes'
import useSWR, { SWRConfiguration } from 'swr'
import { compactObject } from '@latitude-data/core/lib/compactObject'
import { DatasetRowData } from '@latitude-data/core/schema'

type ServerData = {
  rows: DatasetRow[]
  count: number
}
type ClientDatasetRow = Omit<DatasetRow, 'rowData'> & {
  cells: DatasetRowData[keyof DatasetRowData][]
}
type ClientData = {
  rows: ClientDatasetRow[]
  rowCount: number
}
export function buildDatasetRowKey({
  datasetId,
  withCount,
  page,
  pageSize,
}: {
  withCount: boolean
  datasetId?: number
  page?: string | null | undefined
  pageSize?: string | null
}) {
  return compact([
    'datasetRows',
    datasetId,
    withCount ? 'withCount' : 'withoutCount',
    page ? +page : undefined,
    pageSize ? +pageSize : undefined,
  ])
}

const EMPTY_DATA = { rows: [], count: 0 } as ClientData

export default function useDatasetRows(
  {
    dataset,
    page,
    pageSize,
    onFetched,
    withCount = false,
  }: {
    dataset?: DatasetV2
    page?: string | null | undefined
    pageSize?: string | null
    withCount?: boolean
    onFetched?: (datasets: ClientData) => void
  },
  opts?: SWRConfiguration,
) {
  const fetcher = useFetcher(
    dataset ? ROUTES.api.datasetsRows.root : undefined,
    {
      serializer: dataset ? serializeRows(dataset.columns) : undefined,
      searchParams: compactObject({
        datasetId: dataset?.id,
        withCount,
        page: page ? String(page) : undefined,
        pageSize: pageSize ? String(pageSize) : undefined,
      }) as Record<string, string>,
    },
  )
  const {
    data = EMPTY_DATA,
    mutate,
    ...rest
  } = useSWR<ClientData>(
    buildDatasetRowKey({ datasetId: dataset?.id, withCount, page, pageSize }),
    fetcher,
    {
      ...opts,
      fallbackData:
        opts?.fallbackData && dataset
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
    (data: ServerData): ClientData => {
      const processedRows = data.rows.map((item) => {
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
      return { rows: processedRows, rowCount: data.count }
  }
