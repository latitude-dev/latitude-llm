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
  serializeRow,
  serializeRows,
} from './rowSerializationHelpers'
import { useCallback } from 'react'
import { deleteRowsAction } from '$/actions/datasetRows/delete'
import { createDatasetRowAction } from '$/actions/datasetRows/create'

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
      onSuccess: ({ data: updatedRows }) => {
        if (!updatedRows || !updatedRows.length || !dataset) return

        const prevRows = data
        const updatedRowsMap = new Map()

        updatedRows.forEach((row) => {
          updatedRowsMap.set(
            row.id,
            serializeRow({ row, columns: dataset.columns }),
          )
        })
        mutate(prevRows.map((row) => updatedRowsMap.get(row.id) || row))
      },
    },
  )
  const updateRows = useCallback(
    ({ rows }: { rows: ClientDatasetRow[] }) => {
      if (!dataset) return

      const serverRows = rows.map((row) => ({
        rowId: row.id,
        rowData: row.rowData,
      }))

      update({ datasetId: dataset.id, rows: serverRows })
    },
    [update],
  )

  const { execute: deleteRows, isPending: isDeleting } = useLatitudeAction(
    deleteRowsAction,
    {
      onSuccess: ({ data: deletedRows }) => {
        if (!deletedRows || !deletedRows.length || !dataset) return

        mutate(
          data.filter(
            (row) =>
              !deletedRows.some((deletedRow) => deletedRow.id === row.id),
          ),
        )
      },
    },
  )

  const { execute: createRow, isPending: isCreating } = useLatitudeAction(
    createDatasetRowAction,
    {
      onSuccess: ({ data: createdRow }) => {
        if (!createdRow || !dataset) return

        const row = serializeRow({ row: createdRow, columns: dataset.columns })
        mutate([row, ...data])
      },
    },
  )

  return {
    data,
    mutate,
    createRow,
    isCreating,
    updateRows,
    isUpdating,
    deleteRows,
    isDeleting,
    ...rest,
  }
}
