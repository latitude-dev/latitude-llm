'use client'

import { useCurrentDocument } from '$/app/providers/DocumentProvider'
import { useCurrentUrl } from '$/hooks/useCurrentUrl'
import { handleResponse } from '$/hooks/useFetcher'
import { useNavigate } from '$/hooks/useNavigate'
import { SelectableRowsHook } from '$/hooks/useSelectableRows'
import { ROUTES } from '$/services/routes'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { ConfirmModal } from '@latitude-data/web-ui/atoms/Modal'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { useToast } from '@latitude-data/web-ui/atoms/Toast'
import { useCallback, useState } from 'react'
import { Span } from '@latitude-data/constants'

const MAX_IMMEDIATE_DOWNLOAD = 25

export function DownloadSpansButton({
  selectableState,
  spans,
}: {
  selectableState: SelectableRowsHook
  spans: Span[]
}) {
  const { document: latitudeDocument } = useCurrentDocument()
  const { toast } = useToast()
  const navigate = useNavigate()
  const currentUrl = useCurrentUrl()
  const [isDownloading, setIsDownloading] = useState(false)
  const [isModalOpen, setIsModalOpen] = useState(false)

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
    setIsDownloading(true)

    try {
      if (selectableState.selectionMode === 'NONE') {
        console.error('Attempted to download spans with no selection')
        return // invalid state
      }

      if (selectableState.selectionMode === 'PARTIAL') {
        await handleImmediateDownload()
      } else {
        // For ALL or ALL_EXCEPT modes, we would need async download
        // For now, we'll just show an error since we don't have async download for spans yet
        toast({
          title: 'Not supported',
          description:
            'Downloading all spans is not yet supported. Please select specific spans to download.',
          variant: 'destructive',
        })
      }
    } finally {
      setIsDownloading(false)
      setIsModalOpen(false)
    }
  }, [handleImmediateDownload, selectableState, toast])

  const getModalContent = () => {
    const selectedCount = selectableState.selectedCount
    if (selectedCount <= MAX_IMMEDIATE_DOWNLOAD) {
      return `Are you sure you want to download ${selectedCount} spans?`
    }
    return `You are about to download ${selectedCount} spans.`
  }

  return (
    <>
      <Button
        disabled={selectableState.selectedCount === 0 || isDownloading}
        fancy
        variant='outline'
        onClick={() => setIsModalOpen(true)}
      >
        {isDownloading
          ? 'Processing...'
          : `Download ${selectableState.selectedCount} spans`}
      </Button>

      <ConfirmModal
        open={isModalOpen}
        onOpenChange={setIsModalOpen}
        title='Download Spans'
        confirm={{
          label: 'Download',
          isConfirming: isDownloading,
          disabled: isDownloading,
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
