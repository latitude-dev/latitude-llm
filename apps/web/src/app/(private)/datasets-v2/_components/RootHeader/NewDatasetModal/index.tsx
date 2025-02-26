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
import useDatasets from '$/stores/datasetsV2'
import DelimiterSelector from './DelimiterSelector'

export function NewDatasetModal({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const data = { name: '' }
  const navigate = useNavigate()
  const { createError, createFormAction, isCreating } = useDatasets({
    onCreateSuccess: (dataset) =>
      navigate.push(ROUTES.datasetsV2.detail(dataset.id)),
  })
  const errors = createError?.fieldErrors
  return (
    <Modal
      dismissible
      open={open}
      onOpenChange={onOpenChange}
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
