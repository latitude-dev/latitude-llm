import { FormEvent, useCallback, useMemo, useState } from 'react'
import {
  Modal,
  Button,
  Select,
  CloseTrigger,
  RadioButtonsInput,
  Input,
} from '@latitude-data/web-ui'
import { type PreviewLogsState as Props } from './useSelectedLogs'
import { PreviewTable } from './PreviewTable'
import useDatasets from '$/stores/datasetsV2'
import { DatasetV2 } from '@latitude-data/core/browser'

function ExistingDatasetSelector({
  selectedDataset,
  setSelectedDataset,
  fetchPreview,
  errors,
}: {
  selectedDataset: DatasetV2 | undefined
  setSelectedDataset: Props['setSelectedDataset']
  fetchPreview: Props['fetchPreview']
  errors?: string[]
}) {
  const { data: datasets } = useDatasets(
    { page: '1', pageSize: '10000' }, // No paginated
  )
  const datasetOptions = useMemo(
    () => datasets.map((ds) => ({ value: ds.name, label: ds.name })),
    [datasets],
  )
  const onDatasetChange = useCallback(
    (value: string) => {
      const dataset = datasets.find((ds) => ds.name === value)
      if (!dataset) return

      setSelectedDataset(dataset)
      fetchPreview()
    },
    [setSelectedDataset, fetchPreview, datasets],
  )
  return (
    <Select
      name='name'
      label='Your existing datasets'
      placeholder='Select dataset'
      options={datasetOptions}
      defaultValue={selectedDataset?.name}
      onChange={onDatasetChange}
      errors={errors}
    />
  )
}

export function SaveLogsAsDatasetModal({
  previewData,
  previewModalState,
  isSaving,
  saveDataset,
  selectedDataset,
  setSelectedDataset,
  isLoadingPreview,
  fetchPreview,
  error,
}: Props) {
  const [showDatasetSelector, setShowDatasetSelector] = useState(false)
  const onShowDatasetSelector = useCallback(
    (value: string) => {
      setShowDatasetSelector(value === 'existing_dataset')
    },
    [setSelectedDataset, setShowDatasetSelector],
  )
  const datasetOrNotOptions = useMemo(
    () => [
      { label: 'New dataset', value: 'new_dataset' },
      { label: 'Existing dataset', value: 'existing_dataset' },
    ],
    [],
  )
  const onOpenChange = useCallback(
    (newOpen: boolean) => {
      previewModalState.onOpenChange(newOpen)
      if (!newOpen) {
        setSelectedDataset(undefined)
        setShowDatasetSelector(false)
      }
    },
    [
      previewModalState.onOpenChange,
      setSelectedDataset,
      setShowDatasetSelector,
    ],
  )
  const onSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()

      const form = new FormData(event.currentTarget)
      const name = String(form.get('name'))
      saveDataset({ name })
    },
    [saveDataset],
  )
  return (
    <Modal
      dismissible
      open={previewModalState.open}
      onOpenChange={onOpenChange}
      size='xl'
      title='Save logs as dataset'
      description='Save the selected logs as a dataset to use in other parts of the platform.'
      footer={
        <>
          <CloseTrigger />
          <Button
            form='dataset-name'
            type='submit'
            fancy
            variant='default'
            disabled={isSaving}
          >
            {isSaving ? 'Saving...' : 'Save to Dataset'}
          </Button>
        </>
      }
    >
      <div className='flex flex-col gap-y-4'>
        <form
          id='dataset-name'
          className='w-1/3 flex flex-col gap-y-4'
          onSubmit={onSubmit}
        >
          <RadioButtonsInput
            label='Dataset type'
            name='datasetType'
            defaultValue='new_dataset'
            options={datasetOrNotOptions}
            onChange={onShowDatasetSelector}
          />
          {showDatasetSelector ? (
            <ExistingDatasetSelector
              setSelectedDataset={setSelectedDataset}
              selectedDataset={selectedDataset}
              fetchPreview={fetchPreview}
              errors={error?.fieldErrors?.name}
            />
          ) : (
            <Input
              name='name'
              label='Dataset name'
              placeholder='Enter name'
              errors={error?.fieldErrors?.name}
            />
          )}
        </form>
        <PreviewTable previewData={previewData} isLoading={isLoadingPreview} />
      </div>
    </Modal>
  )
}
