import type { DatasetRow, DatasetV2 } from '@latitude-data/core/browser'
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
import { useCallback, useMemo } from 'react'
import { deleteRowsAction } from '$/actions/datasetRows/delete'
import { createDatasetRowAction } from '$/actions/datasetRows/create'

export const DATASET_ROWS_ROUTE = ROUTES.api.datasetsRows.root
export function buildDatasetRowKey({
  datasetId,
  page,
  pageSize,
}: {
  datasetId?: number | undefined
  page?: string | null | undefined
  pageSize?: string | null
}) {
  return compact([
    'datasetRows',
    datasetId,
    page ? +page : undefined,
    pageSize ? +pageSize : undefined,
  ]).join(':')
}

const EMPTY_ARRAY: ClientDatasetRow[] = []
export default function useDatasetRows(
  {
    dataset,
    page,
    pageSize,
    onFetched,
    enabled = true,
  }: {
    dataset?: DatasetV2 | null
    page?: string | null | undefined
    pageSize?: string | null
    onFetched?: (datasets: ClientDatasetRow[]) => void
    enabled?: boolean
  },
  opts?: SWRConfiguration,
) {
  const serializer = useMemo(() => {
    return dataset ? serializeRows(dataset.columns) : undefined
  }, [dataset])
  const datasetId = dataset?.id
  const pageStr = page ? String(page) : undefined
  const pageSizeStr = pageSize ? String(pageSize) : undefined
  const searchParams = useMemo(
    () =>
      compactObject({
        datasetId,
        page: pageStr,
        pageSize: pageSizeStr,
      }) as Record<string, string>,
    [datasetId, pageStr, pageSizeStr],
  )
  const isEnabled = dataset && enabled
  const fetcher = useFetcher<ClientDatasetRow[], DatasetRow[]>(
    isEnabled ? DATASET_ROWS_ROUTE : undefined,
    {
      serializer,
      searchParams,
    },
  )
  const key = buildDatasetRowKey({ datasetId: dataset?.id, page, pageSize })
  const onSuccess = useCallback(
    (data: ClientDatasetRow[]) => {
      onFetched?.(data)
    },
    [onFetched],
  )
  const {
    data = EMPTY_ARRAY,
    mutate,
    ...rest
  } = useSWR(key, fetcher, {
    ...opts,
    fallbackData: opts?.fallbackData
      ? dataset
        ? serializeRows(dataset.columns)(opts.fallbackData)
        : undefined
      : undefined,
    onSuccess,
  })

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
