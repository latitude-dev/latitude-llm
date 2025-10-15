import { useFormAction } from '$/hooks/useFormAction'
import useDatasets from '$/stores/datasets'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { FormWrapper } from '@latitude-data/web-ui/atoms/FormWrapper'
import { Input } from '@latitude-data/web-ui/atoms/Input'
import { Modal } from '@latitude-data/web-ui/atoms/Modal'
import { Select, SelectOption } from '@latitude-data/web-ui/atoms/Select'
import { useMemo } from 'react'
import { DATASET_COLUMN_ROLES } from '@latitude-data/core/constants'
import { Dataset } from '@latitude-data/core/schema/models/types/Dataset'

export function UpdateColumnModal({
  dataset,
  columnKey,
  onClose,
}: {
  dataset: Dataset
  columnKey: string
  onClose: () => void
}) {
  const column = dataset.columns.find((col) => col.identifier === columnKey)
  const { updateColumn, isUpdatingColumn } = useDatasets()
  const options = useMemo<SelectOption<string>[]>(
    () =>
      Object.keys(DATASET_COLUMN_ROLES).map((key) => ({
        label: key,
        value: key,
      })),
    [],
  )
  const { action: updateColumnAction } = useFormAction(updateColumn, {
    onSuccess: () => {
      onClose()
    },
  })

  if (!column) return null

  return (
    <Modal
      dismissible
      open
      onOpenChange={onClose}
      title='Edit Column'
      description={`Edit column ${column.name} in this dataset`}
      footer={
        <>
          <Button variant='outline' fancy onClick={onClose}>
            Cancel
          </Button>
          <Button
            form='edit-column'
            type='submit'
            fancy
            disabled={isUpdatingColumn}
          >
            {isUpdatingColumn ? 'Updating...' : 'Update'}
          </Button>
        </>
      }
    >
      <form id='edit-column' action={updateColumnAction}>
        <FormWrapper>
          <input type='hidden' name='datasetId' value={dataset.id} />
          <input type='hidden' name='identifier' value={column.identifier} />
          <Input required label='Name' name='name' defaultValue={column.name} />
          <Select<string>
            options={options}
            name='role'
            label='Column role'
            defaultValue={column.role ?? DATASET_COLUMN_ROLES.parameter}
          />
        </FormWrapper>
      </form>
    </Modal>
  )
}
