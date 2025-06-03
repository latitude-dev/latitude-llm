import { handleResponse } from '$/hooks/useFetcher'
import { useNavigate } from '$/hooks/useNavigate'
import { ROUTES } from '$/services/routes'
import {
  Dataset,
  ExtendedDocumentLogFilterOptions,
  parseRowCell,
} from '@latitude-data/core/browser'
import { DatasetRowData } from '@latitude-data/core/schema'
import { useToast } from 'node_modules/@latitude-data/web-ui/src/ds/atoms/Toast/useToast'
import { useCallback, useState } from 'react'

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

export function usePreviewLogs({
  documentUuid,
  extendedFilterOptions,
  staticColumnNames,
  parameterColumnNames,
}: {
  documentUuid: string
  dataset?: Dataset
  extendedFilterOptions?: ExtendedDocumentLogFilterOptions
  staticColumnNames?: string[]
  parameterColumnNames?: string[]
}) {
  const [data, setData] = useState<OutputItem>(EMPTY_DATA)
  const [isLoading, setIsLoading] = useState(false)
  const { toast } = useToast()
  const navigate = useNavigate()

  const fetchPreview = useCallback(
    async (name?: string) => {
      try {
        setIsLoading(true)
        const body = {
          documentUuid,
          name,
          extendedFilterOptions,
          staticColumnNames,
          parameterColumnNames,
        }
        const rawResponse = await fetch(ROUTES.api.datasets.previewLogs.root, {
          method: 'POST',
          body: JSON.stringify(body),
        })
        const response = await handleResponse({
          response: rawResponse,
          toast,
          navigate,
          serializer: serializeRows,
        })
        response && setData(response)
      } finally {
        setIsLoading(false)
      }
    },
    [
      documentUuid,
      extendedFilterOptions,
      staticColumnNames,
      parameterColumnNames,
      toast,
      navigate,
    ],
  )

  return { previewData: data, fetchPreview, isLoading }
}
