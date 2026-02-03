import { SubmitEventHandler, useCallback, useMemo, useState } from 'react'
import { Modal } from '@latitude-data/web-ui/atoms/Modal'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Select } from '@latitude-data/web-ui/atoms/Select'
import { RadioButtonsInput } from '@latitude-data/web-ui/atoms/RadioButtonsInput'
import { Input } from '@latitude-data/web-ui/atoms/Input'
import { CloseTrigger } from '@latitude-data/web-ui/atoms/Modal'
import { type PreviewConversationsState as Props } from './useSelectedSpans'
import { PreviewTable } from './PreviewTable'
import useDatasets from '$/stores/datasets'
import { Dataset } from '@latitude-data/core/schema/models/types/Dataset'

function ExistingDatasetSelector({
  selectedDataset,
  setSelectedDataset,
  fetchPreview,
  errors,
}: {
  selectedDataset: Dataset | undefined
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
      required
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

export function SaveSpansAsDatasetModal({
  previewData,
  previewModalState,
  isSaving,
  saveDataset,
  selectedDataset,
  setSelectedDataset,
  isLoadingPreview,
  fetchPreview,
  selectionMode,
  error,
}: Props) {
  const [showDatasetSelector, setShowDatasetSelector] = useState(false)
  const onShowDatasetSelector = useCallback(
    (value: string) => {
      setShowDatasetSelector(value === 'existing_dataset')
      if (value !== 'existing_dataset') setSelectedDataset(undefined)
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
    [previewModalState, setSelectedDataset, setShowDatasetSelector],
  )
  const onSubmit = useCallback<SubmitEventHandler<HTMLFormElement>>(
    (event) => {
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
      title='Add spans to dataset'
      description='Add the selected spans to a new or existing dataset'
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
            {isSaving ? 'Saving...' : 'Add to Dataset'}
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
              required
              name='name'
              label='Dataset name'
              placeholder='Enter name'
              errors={error?.fieldErrors?.name}
            />
          )}
        </form>
        <PreviewTable
          previewData={previewData}
          isLoading={isLoadingPreview}
          selectionMode={selectionMode}
        />
      </div>
    </Modal>
  )
}
