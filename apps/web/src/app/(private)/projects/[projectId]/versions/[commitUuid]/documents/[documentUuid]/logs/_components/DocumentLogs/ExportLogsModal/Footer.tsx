import { Button, Tooltip } from '@latitude-data/web-ui'

export function ExportLogsModalFooter({
  datasetAlreadyExists,
  downloadAsCsvDisabled,
  downloadAsCsv,
  saveAsDatasetDisabled,
  isSavingAsDataset,
  saveAsDataset,
}: {
  datasetName: string
  datasetAlreadyExists: boolean
  saveAsDataset: () => void
  downloadAsCsvDisabled: boolean
  downloadAsCsv: () => void
  saveAsDatasetDisabled: boolean
  isSavingAsDataset: boolean
  setDatasetName: (name: string) => void
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
        open={datasetAlreadyExists ? undefined : false}
        trigger={
          <Button
            fancy
            variant='default'
            disabled={saveAsDatasetDisabled}
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
