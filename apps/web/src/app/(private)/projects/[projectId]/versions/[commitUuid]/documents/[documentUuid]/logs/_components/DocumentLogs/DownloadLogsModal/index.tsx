'use client'
import { Modal } from '@latitude-data/web-ui/atoms/Modal'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { CloseTrigger } from '@latitude-data/web-ui/atoms/Modal'
import { DownloadLogsModalState as Props } from './useDownloadLogsModal'
import { PreviewTable } from '../PreviewTable'

export function DownloadLogsModal({
  data,
  state,
  description,
  isDownloading,
  handleDownload,
  isLoadingPreview,
  previewStaticColumns,
  previewParameterColumns,
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
      description={description}
      footer={
        <>
          <CloseTrigger />
          <Button
            type='button'
            fancy
            variant='default'
            disabled={isDownloading}
            onClick={handleDownload}
          >
            {isDownloading ? 'Downloading...' : 'Download'}
          </Button>
        </>
      }
    >
      <PreviewTable
        previewData={data}
        isLoading={isLoadingPreview}
        subtitle='This is a preview of representative logs based on its parameters. Customize the columns you want to export by clicking in the heading.'
        previewStaticColumns={previewStaticColumns}
        previewParameterColumns={previewParameterColumns}
        onSelectStaticColumn={handleSelectStaticColumn}
        onSelectParameterColumn={handleSelectParameterColumn}
        selectable
      />
    </Modal>
  )
}
