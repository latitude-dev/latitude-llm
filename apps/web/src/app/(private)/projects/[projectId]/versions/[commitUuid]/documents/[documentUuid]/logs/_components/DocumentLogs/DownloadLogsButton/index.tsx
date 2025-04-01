'use client'
import { useCurrentDocument } from '$/app/providers/DocumentProvider'
import { handleResponse } from '$/hooks/useFetcher'
import { useNavigate } from '$/hooks/useNavigate'
import { SelectableRowsHook } from '$/hooks/useSelectableRows'
import { ROUTES } from '$/services/routes'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { useToast } from '@latitude-data/web-ui/atoms/Toast'
import { useCallback, useState } from 'react'

export function DownloadLogsButton({
  selectableState,
}: {
  selectableState: SelectableRowsHook
}) {
  const { document: latitudeDocument } = useCurrentDocument()
  const { toast } = useToast()
  const navigate = useNavigate()
  const [isDownloading, setIsDownloading] = useState(false)
  const onClick = useCallback(async () => {
    const ids = selectableState.getSelectedRowIds()
    const formData = new FormData()
    formData.append('ids', JSON.stringify(ids))

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
  }, [selectableState.getSelectedRowIds])

  return (
    <Button
      disabled={selectableState.selectedCount === 0 || isDownloading}
      fancy
      variant='outline'
      onClick={onClick}
    >
      {isDownloading ? 'Downloading...' : 'Download Logs'}
    </Button>
  )
}
