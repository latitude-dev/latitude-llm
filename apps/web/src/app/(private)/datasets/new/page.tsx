'use client'

import {
  Button,
  CloseTrigger,
  DropzoneInput,
  FormWrapper,
  Input,
  Modal,
} from '@latitude-data/web-ui'
import { useNavigate } from '$/hooks/useNavigate'
import { ROUTES } from '$/services/routes'
import useDatasets from '$/stores/datasets'

export default function NewDataset() {
  const data = { name: '' }
  const navigate = useNavigate()
  const { createError, createFormAction } = useDatasets({
    onCreateSuccess: () => navigate.push(ROUTES.datasets.root),
  })
  const errors = createError?.fieldErrors
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
        action={createFormAction}
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
            multiple={false}
            accept='.csv'
            label='Upload dataset'
            name='dataset_file'
            errors={errors?.dataset_file}
            placeholder='Upload csv'
            description='The first line of the uploaded .csv will be used as headers. The delimiter symbol must be ";"'
          />
        </FormWrapper>
      </form>
    </Modal>
  )
}
