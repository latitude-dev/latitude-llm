import { Button, Tooltip } from '@latitude-data/web-ui'

export function ExportLogsModalFooter({
  datasetAlreadyExists,
  downloadAsCsvDisabled,
  downloadAsCsv,
  saveAsDatasetDisabled,
  isSavingAsDataset,
  saveAsDataset,
  disabled = false,
}: {
  datasetName: string
  datasetAlreadyExists: boolean
  saveAsDataset: () => void
  downloadAsCsvDisabled: boolean
  downloadAsCsv: () => void
  saveAsDatasetDisabled: boolean
  isSavingAsDataset: boolean
  setDatasetName: (name: string) => void
  disabled?: boolean
}) {
  return (
    <div className='flex w-full justify-end gap-2'>
      <Button
        fancy
        variant='secondary'
        disabled={downloadAsCsvDisabled}
        onClick={downloadAsCsv}
      >
        Download
      </Button>
      <Tooltip
        asChild
        open={datasetAlreadyExists ? undefined : false}
        trigger={
          <Button
            fancy
            variant='default'
            disabled={disabled || saveAsDatasetDisabled}
            isLoading={isSavingAsDataset}
            onClick={saveAsDataset}
          >
            Save as Dataset
          </Button>
        }
      >
        A Dataset with this name already exists
      </Tooltip>
    </div>
  )
}
