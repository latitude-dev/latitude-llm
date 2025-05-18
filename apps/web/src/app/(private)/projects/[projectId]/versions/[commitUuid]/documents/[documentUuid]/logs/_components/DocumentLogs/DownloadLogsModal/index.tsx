'use client'
import { Modal } from '@latitude-data/web-ui/atoms/Modal'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { CloseTrigger } from '@latitude-data/web-ui/atoms/Modal'
import { DownloadLogsModalState as Props } from './useDownloadLogsModal'
import { PreviewTable } from '../PreviewTable'

export function DownloadLogsModal({
  data,
  state,
  isDownloading,
  downloadLogs,
  isLoadingPreview,
  selectedStaticColumns,
  selectedParameterColumns,
  handleSelectStaticColumn,
  handleSelectParameterColumn,
}: Props) {
  return (
    <Modal
      dismissible
      open={state.open}
      onOpenChange={(open) => state.onOpenChange(open)}
      size='xl'
      title='Download logs'
      description='Download selected logs as a csv file.'
      footer={
        <>
          <CloseTrigger />
          <Button
            type='button'
            fancy
            variant='default'
            disabled={isDownloading}
            onClick={downloadLogs}
          >
            {isDownloading ? 'Downloading...' : 'Download'}
          </Button>
        </>
      }
    >
      <PreviewTable
        previewData={data}
        isLoading={isLoadingPreview}
        subtitle='Customize the columns you want to export by clicking in the heading.'
        selectedStaticColumns={selectedStaticColumns}
        selectedParameterColumns={selectedParameterColumns}
        onSelectStaticColumn={handleSelectStaticColumn}
        onSelectParameterColumn={handleSelectParameterColumn}
        selectable
      />
    </Modal>
  )
}
