import type { DatasetRow, DatasetV2 } from '@latitude-data/core/browser'
import useFetcher from '$/hooks/useFetcher'
import { compact } from 'lodash-es'
import { ROUTES } from '$/services/routes'
import useSWR, { SWRConfiguration } from 'swr'
import { compactObject } from '@latitude-data/core/lib/compactObject'
import {
  DatasetRowData,
  type DatasetRowDataContent,
} from '@latitude-data/core/schema'
import { format, isValid, parseISO } from 'date-fns'

export type ClientDatasetRow = DatasetRow & {
  cells: DatasetRowData[keyof DatasetRowData][]
}
function formatMaybeIsoDate(value: string): string | null {
  if (typeof value !== 'string') return null

  try {
    const date = parseISO(value)
    if (!isValid(date)) return null

    // If there's time info, include it
    if (value.includes('T') && !value.endsWith('T00:00:00.000Z')) {
      return format(date, 'dd MMM yyyy, HH:mm')
    }

    return format(date, 'dd MMM yyyy')
  } catch {
    return null
  }
}

export function buildDatasetRowKey({
  datasetId,
  page,
  pageSize,
}: {
  datasetId: number | undefined
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
    enabled = true,
  }: {
    dataset?: DatasetV2
    page?: string | null | undefined
    pageSize?: string | null
    onFetched?: (datasets: ClientDatasetRow[]) => void
    enabled?: boolean
  },
  opts?: SWRConfiguration,
) {
  const isEnabled = dataset && enabled
  const fetcher = useFetcher(
    isEnabled ? ROUTES.api.datasetsRows.root : undefined,
    {
      serializer: dataset ? serializeRows(dataset.columns) : undefined,
      searchParams: compactObject({
        datasetId: dataset?.id,
        page: page ? String(page) : undefined,
        pageSize: pageSize ? String(pageSize) : undefined,
      }) as Record<string, string>,
    },
  )
  const {
    data = [],
    mutate,
    ...rest
  } = useSWR<ClientDatasetRow[]>(
    isEnabled
      ? buildDatasetRowKey({ datasetId: dataset.id, page, pageSize })
      : undefined,
    fetcher,
    {
      ...opts,
      fallbackData: opts?.fallbackData
        ? dataset
          ? serializeRows(dataset.columns)(opts.fallbackData)
          : undefined
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
      return {
        ...item,
        cells: columns.map(({ identifier }) => {
          const cell = item.rowData[identifier]
          return parseRowCell({ cell, parseDates: true })
        }),
        createdAt: new Date(item.createdAt),
        updatedAt: new Date(item.updatedAt),
      }
    })
  }

export function parseRowCell({
  cell,
  parseDates,
}: {
  cell: DatasetRowDataContent
  parseDates: boolean
}) {
  if (cell === null || cell === undefined) {
    return ''
  }

  if (
    typeof cell === 'string' ||
    typeof cell === 'number' ||
    typeof cell === 'boolean'
  ) {
    if (typeof cell === 'string' && parseDates) {
      const formattedDate = formatMaybeIsoDate(cell)
      if (formattedDate) return formattedDate
    }
    return String(cell)
  }

  if (typeof cell === 'object') {
    try {
      return JSON.stringify(cell)
    } catch {
      return String(cell)
    }
  }

  return String(cell)
}
