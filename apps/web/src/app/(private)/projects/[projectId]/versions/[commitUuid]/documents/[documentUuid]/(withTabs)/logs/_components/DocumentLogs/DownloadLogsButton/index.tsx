'use client'

import { downloadLogsAsyncAction } from '$/actions/documentLogs/downloadLogs'
import { useCurrentDocument } from '$/app/providers/DocumentProvider'
import { useCurrentUrl } from '$/hooks/useCurrentUrl'
import { handleResponse } from '$/hooks/useFetcher'
import useLatitudeAction from '$/hooks/useLatitudeAction'
import { useNavigate } from '$/hooks/useNavigate'
import type { SelectableRowsHook } from '$/hooks/useSelectableRows'
import { ROUTES } from '$/services/routes'
import type { DocumentLogFilterOptions } from '@latitude-data/core/browser'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { ConfirmModal } from '@latitude-data/web-ui/atoms/Modal'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { useToast } from '@latitude-data/web-ui/atoms/Toast'
import { useCurrentCommit, useCurrentProject } from '@latitude-data/web-ui/providers'
import { useCallback, useState } from 'react'

const MAX_IMMEDIATE_DOWNLOAD = 25

export function DownloadLogsButton({
  selectableState,
  filterOptions,
}: {
  selectableState: SelectableRowsHook
  filterOptions: DocumentLogFilterOptions
}) {
  const { document: latitudeDocument } = useCurrentDocument()
  const { toast } = useToast()
  const navigate = useNavigate()
  const currentUrl = useCurrentUrl()
  const [isDownloading, setIsDownloading] = useState(false)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const { commit } = useCurrentCommit()
  const { project } = useCurrentProject()

  const { execute: executeAsyncDownload } = useLatitudeAction(downloadLogsAsyncAction, {
    onSuccess: () => {
      toast({
        title: 'Download Started',
        description: 'You will receive an email with the download link once the file is ready.',
      })
    },
  })

  const handleImmediateDownload = useCallback(async () => {
    const formData = new FormData()
    formData.append('ids', JSON.stringify(selectableState.selectedRowIds))

    const rawResponse = await fetch(ROUTES.api.documentLogs.downloadLogs.root, {
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
    a.download = `latitude-logs-for-${latitudeDocument.path}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }, [selectableState.selectedRowIds, latitudeDocument.path, navigate, currentUrl, toast])

  const handleDownload = useCallback(async () => {
    setIsDownloading(true)

    try {
      if (selectableState.selectionMode === 'NONE') {
        console.error('Attempted to download logs with no selection')
        return // invalid state
      }

      if (selectableState.selectionMode === 'PARTIAL') {
        await handleImmediateDownload()
      } else {
        await executeAsyncDownload({
          documentUuid: latitudeDocument.documentUuid,
          commitUuid: commit.uuid,
          projectId: project.id,
          filterOptions,
          selectionMode: selectableState.selectionMode,
          excludedDocumentLogIds: Array.from(selectableState.excludedIds) as number[],
        })
      }
    } finally {
      setIsDownloading(false)
      setIsModalOpen(false)
    }
  }, [
    handleImmediateDownload,
    executeAsyncDownload,
    selectableState,
    latitudeDocument.documentUuid,
    commit.uuid,
    project.id,
    filterOptions,
  ])

  const getModalContent = () => {
    const selectedCount = selectableState.selectedCount
    if (selectedCount <= MAX_IMMEDIATE_DOWNLOAD) {
      return `Are you sure you want to download ${selectedCount} logs?`
    }
    return `You are about to download ${selectedCount} logs. Due to the large number of logs, you will receive an email with the download link once the file is ready. The actual number of exported logs might be different because logs with execution errors are excluded.`
  }

  return (
    <>
      <Button
        disabled={selectableState.selectedCount === 0 || isDownloading}
        fancy
        variant='outline'
        onClick={() => setIsModalOpen(true)}
      >
        {isDownloading ? 'Processing...' : `Download ${selectableState.selectedCount} logs`}
      </Button>

      <ConfirmModal
        open={isModalOpen}
        onOpenChange={setIsModalOpen}
        title='Download Logs'
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
