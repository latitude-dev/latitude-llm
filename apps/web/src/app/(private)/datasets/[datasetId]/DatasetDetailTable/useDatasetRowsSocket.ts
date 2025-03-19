import {
  EventArgs,
  useSockets,
} from '$/components/Providers/WebsocketsProvider/useSockets'
import useDatasetRows, { serializeRows } from '$/stores/datasetRows'
import { DatasetRow, DatasetV2 } from '@latitude-data/core/browser'
import { useToast } from '@latitude-data/web-ui'
import { useCallback, useRef, useState } from 'react'
import { useSWRConfig } from 'swr'

function useCachedRows({
  dataset,
  currentPage: startingPage,
  pageSize,
}: {
  dataset: DatasetV2
  currentPage: number
  pageSize: string
}) {
  const { cache } = useSWRConfig()
  const currentPage = useRef<number>(startingPage)
  return useCallback(
    (rows: DatasetRow[]) => {
      const newRows = serializeRows(dataset.columns)(rows)
      let leftoverRows = [...newRows]

      const size = Number(pageSize)
      while (leftoverRows.length > 0) {
        const key = `@"datasetRows",${dataset.id},${currentPage.current},${pageSize}`

        const existingEntry = cache.get(key)
        const existingRows = existingEntry?.data ?? []

        if (existingRows.length < size) {
          const capacity = size - existingRows.length
          const toAdd = leftoverRows.slice(0, capacity)
          leftoverRows = leftoverRows.slice(capacity)

          const updatedRows = [...existingRows, ...toAdd]
          cache.set(key, { data: updatedRows })
        }

        currentPage.current += 1
      }
    },
    [cache, dataset, startingPage, pageSize],
  )
}

export function useDatasetRowsSocket({
  dataset,
  mutate,
  pageSize,
  currentPage,
}: {
  dataset: DatasetV2
  mutate: ReturnType<typeof useDatasetRows>['mutate']
  currentPage: number
  pageSize: string
}) {
  const { toast } = useToast()
  const setRowsInCache = useCachedRows({ dataset, currentPage, pageSize })
  const [isProcessing, setIsProcessing] = useState(false)
  const [processedRowsCount, setProcessedRows] = useState<number>(0)
  const onMessage = useCallback(
    (event: EventArgs<'datasetRowsCreated'>) => {
      if (event.datasetId !== dataset.id) return

      if (event.error) {
        toast({
          variant: 'destructive',
          title: 'Error generating datasets',
          description: event.error.message,
        })
        return
      }

      if (event.finished) {
        setIsProcessing(false)
        return
      }

      setIsProcessing(true)
      setProcessedRows((prev) => {
        return prev ? prev + event.rows.length : event.rows.length
      })
      setRowsInCache(event.rows)
    },
    [dataset, mutate, toast, setIsProcessing, setRowsInCache, setProcessedRows],
  )

  useSockets({ event: 'datasetRowsCreated', onMessage })

  return { isProcessing, processedRowsCount }
}
