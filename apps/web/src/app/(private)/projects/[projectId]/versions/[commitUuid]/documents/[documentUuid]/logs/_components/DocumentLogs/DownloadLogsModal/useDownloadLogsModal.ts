import { useCurrentDocument } from '$/app/providers/DocumentProvider'
import { handleResponse } from '$/hooks/useFetcher'
import { useNavigate } from '$/hooks/useNavigate'
import { SelectableRowsHook } from '$/hooks/useSelectableRows'
import { useToggleModal } from '$/hooks/useToogleModal'
import { ROUTES } from '$/services/routes'
import { usePreviewLogs } from '$/stores/previewLogs'
import { useToast } from '@latitude-data/web-ui/atoms/Toast'
import { useCallback, useEffect, useState } from 'react'

// Map() to maintain the order of the columns
const DEFAULT_STATIC_COLUMNS = [
  'output',
  'id',
  'commit.title',
  'duration',
  'costInMillicents',
  'tokens',
  'createdAt',
]

const getSelectedColumns = (columns?: Map<string, boolean>) => {
  if (!columns) return []
  return [...columns.entries()].filter(([, value]) => value).map(([key]) => key)
}

export function useDownloadLogsModal({
  selectableState,
}: {
  selectableState: SelectableRowsHook
}) {
  const { document: latitudeDocument } = useCurrentDocument()
  const { toast } = useToast()
  const navigate = useNavigate()
  const previewModalState = useToggleModal()
  const [selectedLogIds, setSelectedLogIds] = useState<(string | number)[]>([])
  const { previewData, fetchPreview, isLoading } = usePreviewLogs({
    documentLogIds: selectedLogIds,
    staticColumnNames: DEFAULT_STATIC_COLUMNS,
  })
  const [isDownloading, setIsDownloading] = useState(false)
  const [staticColumns, setStaticColumns] = useState<Map<string, boolean>>()
  const [parameterColumns, setParameterColumns] =
    useState<Map<string, boolean>>()

  const showModal = useCallback(() => {
    previewModalState.onOpen()
    setSelectedLogIds(selectableState.getSelectedRowIds())
    fetchPreview()
  }, [
    fetchPreview,
    setSelectedLogIds,
    previewModalState.onOpen,
    selectableState.getSelectedRowIds,
  ])

  const downloadLogs = useCallback(async () => {
    const ids = selectableState.getSelectedRowIds()
    const selectedStaticColumns = getSelectedColumns(staticColumns)
    const selectedParameterColumns = getSelectedColumns(parameterColumns)
    const formData = new FormData()
    formData.append('ids', JSON.stringify(ids))
    formData.append('staticColumnNames', JSON.stringify(selectedStaticColumns))
    formData.append(
      'parameterColumnNames',
      JSON.stringify(selectedParameterColumns),
    )

    setIsDownloading(true)
    const rawResponse = await fetch(ROUTES.api.documentLogs.downloadLogs.root, {
      method: 'POST',
      body: formData,
    })
    const response = await handleResponse({
      returnRaw: true,
      response: rawResponse,
      toast,
      navigate,
    }).finally(() => setIsDownloading(false))

    if (!response) return

    const blob = await response.blob()
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `latitude-logs-for-${latitudeDocument.path}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }, [selectableState.getSelectedRowIds, staticColumns, parameterColumns])

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

  const handleSelectStaticColumn = useCallback(
    (column: string) => {
      setStaticColumns((prev) => {
        if (!prev?.has(column)) return prev
        return new Map(prev.set(column, !prev.get(column)))
      })
    },
    [setStaticColumns],
  )

  const handleSelectParameterColumn = useCallback(
    (column: string) => {
      setParameterColumns((prev) => {
        if (!prev?.has(column)) return prev
        return new Map(prev.set(column, !prev.get(column)))
      })
    },
    [setParameterColumns],
  )

  return {
    data: previewData,
    state: previewModalState,
    showModal,
    downloadLogs,
    isLoadingPreview: isLoading,
    isDownloading,
    fetchPreview,
    previewStaticColumns: staticColumns,
    previewParameterColumns: parameterColumns,
    handleSelectStaticColumn,
    handleSelectParameterColumn,
  }
}

export type DownloadLogsModalState = ReturnType<typeof useDownloadLogsModal>
