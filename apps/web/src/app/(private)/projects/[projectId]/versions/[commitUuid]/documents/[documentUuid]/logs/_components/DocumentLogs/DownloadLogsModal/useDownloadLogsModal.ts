import { downloadLogsAsyncAction } from '$/actions/documentLogs/downloadLogsAsync'
import { useCurrentDocument } from '$/app/providers/DocumentProvider'
import { handleResponse } from '$/hooks/useFetcher'
import useLatitudeAction from '$/hooks/useLatitudeAction'
import { useNavigate } from '$/hooks/useNavigate'
import { SelectableRowsHook } from '$/hooks/useSelectableRows'
import { useToggleModal } from '$/hooks/useToogleModal'
import { ROUTES } from '$/services/routes'
import { usePreviewLogs } from '$/stores/previewLogs'
import { ExtendedDocumentLogFilterOptions } from '@latitude-data/core/browser'
import { useToast } from '@latitude-data/web-ui/atoms/Toast'
import {
  useCurrentCommit,
  useCurrentProject,
} from '@latitude-data/web-ui/providers'
import { useCallback, useEffect, useMemo, useState } from 'react'

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

const MAX_IMMEDIATE_DOWNLOAD = 100

export function useDownloadLogsModal({
  selectableState,
  extendedFilterOptions,
}: {
  selectableState: SelectableRowsHook
  extendedFilterOptions: ExtendedDocumentLogFilterOptions
}) {
  const { document: latitudeDocument } = useCurrentDocument()
  const { toast } = useToast()
  const navigate = useNavigate()
  const { commit } = useCurrentCommit()
  const { project } = useCurrentProject()
  const state = useToggleModal()
  const {
    previewData: data,
    fetchPreview,
    isLoading,
  } = usePreviewLogs({
    documentUuid: latitudeDocument.documentUuid,
    extendedFilterOptions,
    staticColumnNames: DEFAULT_STATIC_COLUMNS,
  })
  const [isDownloading, setIsDownloading] = useState(false)
  const [staticColumns, setStaticColumns] = useState<Map<string, boolean>>()
  const [parameterColumns, setParameterColumns] =
    useState<Map<string, boolean>>()

  const { execute: executeAsyncDownload } = useLatitudeAction(
    downloadLogsAsyncAction,
    {
      onSuccess: () => {
        toast({
          title: 'Download Started',
          description:
            'You will receive an email with the download link once the file is ready.',
        })
      },
    },
  )

  const showModal = useCallback(() => {
    state.onOpen()
    fetchPreview()
  }, [fetchPreview, state.onOpen])

  const handleImmediateDownload = useCallback(async () => {
    const body = {
      documentUuid: latitudeDocument.documentUuid,
      extendedFilterOptions,
      staticColumnNames: getSelectedColumns(staticColumns),
      parameterColumnNames: getSelectedColumns(parameterColumns),
    }
    const rawResponse = await fetch(ROUTES.api.documentLogs.downloadLogs.root, {
      method: 'POST',
      body: JSON.stringify(body),
    })
    const response = await handleResponse({
      returnRaw: true,
      response: rawResponse,
      toast,
      navigate,
    })

    if (!response) return

    const blob = await response.blob()
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `latitude-logs-for-${latitudeDocument.path}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }, [latitudeDocument.path, navigate, toast, staticColumns, parameterColumns])

  const handleDownload = useCallback(async () => {
    setIsDownloading(true)
    try {
      if (selectableState.selectionMode === 'NONE') {
        console.error('Attempted to download logs with no selection')
        return // invalid state
      }

      if (selectableState.selectedCount < MAX_IMMEDIATE_DOWNLOAD) {
        await handleImmediateDownload()
      } else {
        await executeAsyncDownload({
          projectId: project.id,
          commitUuid: commit?.uuid,
          documentUuid: latitudeDocument.documentUuid,
          extendedFilterOptions,
          staticColumnNames: getSelectedColumns(staticColumns),
          parameterColumnNames: getSelectedColumns(parameterColumns),
        })
      }
    } finally {
      setIsDownloading(false)
    }
  }, [handleImmediateDownload, executeAsyncDownload, selectableState])

  useEffect(() => {
    if (!data?.columns) return
    const [parameterColumns, staticColumns] = data.columns.reduce(
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
  }, [data])

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

  const description = useMemo(() => {
    const selectedCount = selectableState.selectedCount
    if (selectedCount <= MAX_IMMEDIATE_DOWNLOAD) {
      return `Are you sure you want to download ${selectedCount} logs?`
    }
    return `You are about to download ${selectedCount} logs. Due to the large number of logs, you will receive an email with the download link once the file is ready. The actual number of exported logs might be different because logs with execution errors are excluded.`
  }, [selectableState.selectedCount])

  return useMemo(
    () => ({
      data,
      state,
      description,
      showModal,
      handleDownload,
      isLoadingPreview: isLoading,
      isDownloading,
      fetchPreview,
      previewStaticColumns: staticColumns,
      previewParameterColumns: parameterColumns,
      handleSelectStaticColumn,
      handleSelectParameterColumn,
    }),
    [
      data,
      state,
      description,
      showModal,
      handleDownload,
      isLoading,
      isDownloading,
      fetchPreview,
      staticColumns,
      parameterColumns,
      handleSelectStaticColumn,
      handleSelectParameterColumn,
    ],
  )
}

export type DownloadLogsModalState = ReturnType<typeof useDownloadLogsModal>
