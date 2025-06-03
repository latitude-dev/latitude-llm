import { useFormAction } from '$/hooks/useFormAction'
import { DATASET_COLUMN_ROLES, Dataset } from '@latitude-data/core/browser'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { FormWrapper } from '@latitude-data/web-ui/atoms/FormWrapper'
import { Input } from '@latitude-data/web-ui/atoms/Input'
import { Modal } from '@latitude-data/web-ui/atoms/Modal'
import { Select, SelectOption } from '@latitude-data/web-ui/atoms/Select'
import { useEffect, useMemo, useTransition } from 'react'
import { createDatasetColumnAction } from '$/actions/datasets/createColumn'

export function CreateColumnModal({
  dataset,
  onClose,
  onLoadingChange,
  onSuccess,
}: {
  dataset: Dataset
  onClose: () => void
  onLoadingChange?: (isLoading: boolean) => void
  onSuccess?: () => void
}) {
  const [isPending] = useTransition()
  const options = useMemo<SelectOption<string>[]>(
    () =>
      Object.keys(DATASET_COLUMN_ROLES).map((key) => ({
        label: key,
        value: key,
      })),
    [],
  )
  const { action: createColumnAction } = useFormAction(createDatasetColumnAction, {
    onSuccess: () => {
      onSuccess?.()
      onClose()
    },
  })

  useEffect(() => {
    onLoadingChange?.(isPending)
  }, [isPending, onLoadingChange])

  return (
    <Modal
      dismissible
      open
      onOpenChange={onClose}
      title='Create Column'
      description='Add a new column to this dataset'
      footer={
        <>
          <Button variant='outline' fancy onClick={onClose}>
            Cancel
          </Button>
          <Button
            form='create-column'
            type='submit'
            fancy
            disabled={isPending}
          >
            {isPending ? 'Creating...' : 'Create'}
          </Button>
        </>
      }
    >
      <form id='create-column' action={createColumnAction}>
        <FormWrapper>
          <input type='hidden' name='datasetId' value={dataset.id} />
          <Input required label='Name' name='name' />
          <Select<string>
            options={options}
            name='role'
            label='Column role'
            defaultValue={DATASET_COLUMN_ROLES.parameter}
          />
        </FormWrapper>
      </form>
    </Modal>
  )
}
