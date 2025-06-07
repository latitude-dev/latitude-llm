import { Column } from '@latitude-data/core/schema'
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
import { useCallback, useEffect, useMemo, useState } from 'react'

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

const getSelectedColumns = (columns?: Map<string, boolean>) => {
  if (!columns) return []
  return [...columns.entries()].filter(([, value]) => value).map(([key]) => key)
}

export function usePreviewTable({
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
  const [previewData, setPreviewData] = useState<OutputItem>(EMPTY_DATA)
  const [staticColumns, setStaticColumns] = useState<Map<string, boolean>>()
  const [parameterColumns, setParameterColumns] =
    useState<Map<string, boolean>>()
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
        response && setPreviewData(response)
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

  const isColumnSelected = useCallback(
    (column: Column) => {
      if (column.role === 'parameter') {
        return parameterColumns?.get(column.name) ?? false
      } else if (column.role === 'label' || column.role === 'metadata') {
        return staticColumns?.get(column.name) ?? false
      }
      return false
    },
    [parameterColumns, staticColumns],
  )

  const handleSelectColumn = useCallback((column: Column) => {
    const columnName = column.name
    if (column.role === 'parameter') {
      setParameterColumns((prev) => {
        if (!prev?.has(columnName)) return prev
        return new Map(prev.set(columnName, !prev.get(columnName)))
      })
    } else if (column.role === 'label' || column.role === 'metadata') {
      setStaticColumns((prev) => {
        if (!prev?.has(columnName)) return prev
        return new Map(prev.set(columnName, !prev.get(columnName)))
      })
    }
  }, [])

  useEffect(() => {
    if (!previewData?.columns) return
    const [parameterColumns, staticColumns] = previewData.columns.reduce(
      ([parameterColumns, staticColumns], column) => {
        const toMap =
          column.role === 'parameter' ? parameterColumns : staticColumns
        toMap.set(column.name, true)
        return [parameterColumns, staticColumns]
      },
      [new Map(), new Map()],
    )
    setParameterColumns(parameterColumns)
    setStaticColumns(staticColumns)
  }, [previewData])

  const selectedStaticColumnNames = useMemo(
    () => getSelectedColumns(staticColumns),
    [staticColumns],
  )

  const selectedParameterColumnNames = useMemo(
    () => getSelectedColumns(parameterColumns),
    [parameterColumns],
  )

  return {
    previewData,
    fetchPreview,
    isLoading,
    isColumnSelected,
    handleSelectColumn,
    selectedStaticColumnNames,
    selectedParameterColumnNames,
  }
}
