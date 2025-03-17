'use client'

import {
  Button,
  CloseTrigger,
  DropzoneInput,
  FormWrapper,
  Input,
  Modal,
} from '@latitude-data/web-ui'
import DelimiterSelector from '$/app/(private)/datasets/new/_components/DelimiterSelector'
import { useNavigate } from '$/hooks/useNavigate'
import { ROUTES } from '$/services/routes'
import useDatasets from '$/stores/datasets'

export default function NewDataset() {
  const data = { name: '' }
  const navigate = useNavigate()
  const { createError, createFormAction, isCreating } = useDatasets({
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
          <Button
            disabled={isCreating}
            fancy
            form='createDatasetForm'
            type='submit'
          >
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
            required
            type='text'
            label='Name'
            name='name'
            errors={errors?.name}
            defaultValue={data?.name}
            placeholder='Amazing dataset'
          />
          <DelimiterSelector
            delimiterInputName='csvDelimiter'
            delimiterErrors={errors?.csvDelimiter}
            customDelimiterInputName='csvCustomDelimiter'
            customDelimiterValue={''}
            customDelimiterErrors={errors?.csvCustomDelimiter}
          />
          <DropzoneInput
            multiple={false}
            accept='.csv'
            label='Upload dataset'
            name='dataset_file'
            errors={errors?.dataset_file}
            placeholder='Upload csv'
            description='The first line of the uploaded .csv will be used as headers'
          />
        </FormWrapper>
      </form>
    </Modal>
  )
}
