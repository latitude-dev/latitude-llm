'use client'

import { useCallback, useState } from 'react'
import { useCurrentDocument } from '$/app/providers/DocumentProvider'
import { useCurrentProject } from '$/app/providers/ProjectProvider'
import { useCurrentCommit } from '$/app/providers/CommitProvider'
import { useCurrentUrl } from '$/hooks/useCurrentUrl'
import { handleResponse } from '$/hooks/useFetcher'
import useLatitudeAction from '$/hooks/useLatitudeAction'
import { useNavigate } from '$/hooks/useNavigate'
import { SelectableRowsHook } from '$/hooks/useSelectableRows'
import { SpansFilters } from '$/lib/schemas/filters'
import { ROUTES } from '$/services/routes'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { ConfirmModal } from '@latitude-data/web-ui/atoms/Modal'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { useToast } from '@latitude-data/web-ui/atoms/Toast'
import { Span } from '@latitude-data/constants'
import { downloadSpansAction } from '$/actions/spans/downloadSpans'

const MAX_IMMEDIATE_DOWNLOAD = 25

export function DownloadSpansButton({
  selectableState,
  spans,
  filters,
}: {
  selectableState: SelectableRowsHook
  spans: Span[]
  filters: SpansFilters
}) {
  const { document: latitudeDocument } = useCurrentDocument()
  const { project } = useCurrentProject()
  const { commit } = useCurrentCommit()
  const { toast } = useToast()
  const navigate = useNavigate()
  const currentUrl = useCurrentUrl()
  const [isDownloading, setIsDownloading] = useState(false)
  const [isModalOpen, setIsModalOpen] = useState(false)

  const { execute: executeDownloadAction, isPending: isActionPending } =
    useLatitudeAction(downloadSpansAction, {
      onError: (error) => {
        toast({
          title: 'Error',
          description: error?.message || 'Failed to start export',
          variant: 'destructive',
        })
      },
    })

  const handleImmediateDownload = useCallback(async () => {
    const selectedSpans = spans.filter((span) =>
      selectableState.selectedRowIds.includes(span.id),
    )
    const spanIdentifiers = selectedSpans.map((span) => ({
      traceId: span.traceId,
      spanId: span.id,
    }))

    const formData = new FormData()
    formData.append('spanIdentifiers', JSON.stringify(spanIdentifiers))

    const rawResponse = await fetch(ROUTES.api.spans.downloadSpans.root, {
      method: 'POST',
      body: formData,
    })
    const response = await handleResponse({
      returnRaw: true,
      response: rawResponse,
      toast,
      navigate,
      currentUrl,
    })

    if (!response) return

    const blob = await response.blob()
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `latitude-spans-for-${latitudeDocument.path}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    window.URL.revokeObjectURL(url)
  }, [
    selectableState.selectedRowIds,
    spans,
    latitudeDocument.path,
    navigate,
    currentUrl,
    toast,
  ])

  const handleDownload = useCallback(async () => {
    if (selectableState.selectionMode === 'NONE') {
      return
    }

    setIsDownloading(true)

    try {
      const selectedSpanIdentifiers = spans
        .filter((span) => selectableState.selectedRowIds.includes(span.id))
        .map((span) => ({ traceId: span.traceId, spanId: span.id }))

      const excludedSpanIdentifiers = Array.from(selectableState.excludedIds)
        .map((id) => spans.find((span) => span.id === id))
        .filter((span): span is Span => span !== undefined)
        .map((span) => ({ traceId: span.traceId, spanId: span.id }))

      const [data, error] = await executeDownloadAction({
        projectId: project.id,
        commitUuid: commit.uuid,
        documentUuid: latitudeDocument.documentUuid,
        selectionMode: selectableState.selectionMode,
        selectedSpanIdentifiers,
        excludedSpanIdentifiers,
        filters,
      })

      if (error || !data) return

      if (data.mode === 'sync') {
        await handleImmediateDownload()
      } else {
        toast({
          title: 'Export started',
          description: 'You will receive an email when your export is ready.',
        })
        selectableState.clearSelections()
      }
    } finally {
      setIsDownloading(false)
      setIsModalOpen(false)
    }
  }, [
    selectableState,
    spans,
    project.id,
    commit.uuid,
    latitudeDocument.documentUuid,
    filters,
    executeDownloadAction,
    handleImmediateDownload,
    toast,
  ])

  const isProcessing = isDownloading || isActionPending
  const isAsyncDownload =
    selectableState.selectionMode === 'ALL' ||
    selectableState.selectionMode === 'ALL_EXCEPT' ||
    selectableState.selectedCount > MAX_IMMEDIATE_DOWNLOAD

  const getModalContent = () => {
    const selectedCount = selectableState.selectedCount
    if (isAsyncDownload) {
      return `You are about to export ${selectedCount} spans. This will be processed in the background and you will receive an email when your export is ready.`
    }
    return `Are you sure you want to download ${selectedCount} spans?`
  }

  return (
    <>
      <Button
        disabled={selectableState.selectedCount === 0 || isProcessing}
        fancy
        variant='outline'
        onClick={() => setIsModalOpen(true)}
      >
        {isProcessing
          ? 'Processing...'
          : `Download ${selectableState.selectedCount} spans`}
      </Button>

      <ConfirmModal
        open={isModalOpen}
        onOpenChange={setIsModalOpen}
        title='Download Spans'
        confirm={{
          label: isAsyncDownload ? 'Start Export' : 'Download',
          isConfirming: isProcessing,
          disabled: isProcessing,
        }}
        cancel={{
          label: 'Close',
        }}
        onConfirm={handleDownload}
        dismissible
      >
        <Text.H5>{getModalContent()}</Text.H5>
      </ConfirmModal>
    </>
  )
}
