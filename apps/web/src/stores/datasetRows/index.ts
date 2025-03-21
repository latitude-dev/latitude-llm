import type { DatasetV2 } from '@latitude-data/core/browser'
import useFetcher from '$/hooks/useFetcher'
import { compact } from 'lodash-es'
import { ROUTES } from '$/services/routes'
import useSWR, { SWRConfiguration } from 'swr'
import { compactObject } from '@latitude-data/core/lib/compactObject'
import useLatitudeAction from '$/hooks/useLatitudeAction'
import { updateDatasetRowAction } from '$/actions/datasetRows/update'
import {
  ClientDatasetRow,
  deserializeRow,
  serializeRow,
  serializeRows,
} from './rowSerializationHelpers'
import { useCallback } from 'react'

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

  const { execute: update, isPending: isUpdating } = useLatitudeAction(
    updateDatasetRowAction,
    {
      onSuccess: ({ data: updatedRow }) => {
        if (!updatedRow || !dataset) return

        const prevRows = data

        mutate(
          prevRows.map((prevRow) =>
            prevRow.id === updatedRow.id
              ? serializeRow({ row: updatedRow, columns: dataset.columns })
              : prevRow,
          ),
        )
      },
    },
  )
  const updateRows = useCallback(
    ({ rows }: { rows: ClientDatasetRow[] }) => {
      const rowsData = rows.map((row) => ({
        rowId: row.id,
        rowData: deserializeRow({ row, columns: dataset.columns }),
      }))
      update({ datasetId: dataset.id, rows: rowsData })
    },
    [update],
  )

  return {
    data,
    mutate,
    updateRow,
    isUpdating,
    ...rest,
  }
}
