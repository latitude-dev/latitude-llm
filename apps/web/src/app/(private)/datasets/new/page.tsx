'use client'

import {
  Button,
  CloseTrigger,
  DropzoneInput,
  FormWrapper,
  Input,
  Modal,
  // useToast,
} from '@latitude-data/web-ui'
import { createDatasetAction } from '$/actions/datasets/create'
import useLatitudeAction from '$/hooks/useLatitudeAction'
import { useNavigate } from '$/hooks/useNavigate'
import { ROUTES } from '$/services/routes'

export default function NewDataset() {
  const data = { name: '' }
  const navigate = useNavigate()
  const { error, executeFormAction } = useLatitudeAction(createDatasetAction)
  const errors = error?.fieldErrors
  return (
    <Modal
      open
      onOpenChange={(open) => !open && navigate.push(ROUTES.datasets.root)}
      title='Create new dataset'
      description='Datasets allow you to test prompts and evaluations with your own data.'
      footer={
        <>
          <CloseTrigger />
          <Button fancy form='createDatasetForm' type='submit'>
            Create dataset
          </Button>
        </>
      }
    >
      <form
        className='min-w-0'
        id='createDatasetForm'
        action={executeFormAction}
      >
        <FormWrapper>
          <Input
            type='text'
            label='Name'
            name='name'
            errors={errors?.name}
            defaultValue={data?.name}
            placeholder='Amazing dataset'
          />
          <DropzoneInput
            label='Upload dataset'
            name='dataset_file'
            errors={errors?.dataset_file}
            placeholder='Upload csv'
            multiple={false}
            accept='.csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel'
          />
        </FormWrapper>
      </form>
    </Modal>
  )
}
