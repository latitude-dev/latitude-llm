import { useCurrentDocument } from '$/app/providers/DocumentProvider'
import { handleResponse } from '$/hooks/useFetcher'
import { useNavigate } from '$/hooks/useNavigate'
import { SelectableRowsHook } from '$/hooks/useSelectableRows'
import { useToggleModal } from '$/hooks/useToogleModal'
import { ROUTES } from '$/services/routes'
import { usePreviewLogs } from '$/stores/previewLogs'
import { Column } from '@latitude-data/core/schema'
import { useToast } from '@latitude-data/web-ui/atoms/Toast'
import { useCallback, useEffect, useState } from 'react'

const DEFAULT_STATIC_COLUMNS = [
  'output',
  'id',
  'commit.title',
  'duration',
  'costInMillicents',
  'tokens',
]

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
    documentLogIds: selectedLogIds[0] ? [selectedLogIds[0]] : [],
    staticColumnNames: DEFAULT_STATIC_COLUMNS,
  })
  const [isDownloading, setIsDownloading] = useState(false)
  const [selectedStaticColumns, setSelectedStaticColumns] = useState<string[]>(
    DEFAULT_STATIC_COLUMNS,
  )
  const [selectedParameterColumns, setSelectedParameterColumns] =
    useState<string[]>()

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
  }, [
    selectableState.getSelectedRowIds,
    selectedStaticColumns,
    selectedParameterColumns,
  ])

  useEffect(() => {
    const parameterColumnNames = previewData?.columns
      .filter((c) => c.role === 'parameter')
      .map((c) => c.name)
    setSelectedParameterColumns(parameterColumnNames)
  }, [previewData])

  const handleSelectStaticColumn = useCallback(
    (column: string) => {
      setSelectedStaticColumns((prev) =>
        prev.includes(column)
          ? prev.filter((name) => name !== column)
          : [...prev, column],
      )
    },
    [setSelectedStaticColumns],
  )

  const handleSelectParameterColumn = useCallback(
    (column: string) => {
      setSelectedParameterColumns((prev) => {
        if (!prev) return
        return prev.includes(column)
          ? prev.filter((name) => name !== column)
          : [...prev, column]
      })
    },
    [setSelectedParameterColumns],
  )

  return {
    data: previewData,
    state: previewModalState,
    showModal,
    downloadLogs,
    isLoadingPreview: isLoading,
    isDownloading,
    fetchPreview,
    selectedStaticColumns,
    selectedParameterColumns,
    handleSelectStaticColumn,
    handleSelectParameterColumn,
  }
}

export type DownloadLogsModalState = ReturnType<typeof useDownloadLogsModal>
