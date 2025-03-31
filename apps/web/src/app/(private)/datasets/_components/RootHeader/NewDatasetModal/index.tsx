import { Button } from '@latitude-data/web-ui/atoms/Button'
import { DropzoneInput } from '@latitude-data/web-ui/atoms/DropzoneInput'
import { FormWrapper } from '@latitude-data/web-ui/atoms/FormWrapper'
import { Input } from '@latitude-data/web-ui/atoms/Input'
import { Modal } from '@latitude-data/web-ui/atoms/Modal'
import { useToast } from '@latitude-data/web-ui/atoms/Toast'
import { CloseTrigger } from '@latitude-data/web-ui/atoms/Modal'
import { useNavigate } from '$/hooks/useNavigate'
import { ROUTES } from '$/services/routes'
import useDatasets from '$/stores/datasetsV2'
import DelimiterSelector from '$/app/(private)/datasets/_components/DelimiterSelector'
import {
  EventArgs,
  useSockets,
} from '$/components/Providers/WebsocketsProvider/useSockets'
import { useCallback, useState } from 'react'
import { DatasetV2 } from '@latitude-data/core/browser'

export function NewDatasetModalComponent({
  open,
  onOpenChange,
  createFormAction,
  isCreating,
  createError,
}: {
  createFormAction: ReturnType<typeof useDatasets>['createFormAction']
  createError: ReturnType<typeof useDatasets>['createError']
  open: boolean
  isCreating: boolean
  onOpenChange: (open: boolean) => void
}) {
  const data = { name: '' }
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
            {isCreating ? 'Creating dataset...' : 'Create dataset'}
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

export type NewDatasetModalProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}
export function NewDatasetModal({ open, onOpenChange }: NewDatasetModalProps) {
  const navigate = useNavigate()
  const { toast } = useToast()
  const [createdDataset, setCreatedDataset] = useState<DatasetV2 | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const { createError, createFormAction, isCreating } = useDatasets({
    onCreateSuccess: (dataset) => {
      setCreatedDataset(dataset)
      setIsProcessing(true)
    },
  })

  const createdDatasetId = createdDataset?.id
  const [firstBatchCreated, setFirstBatchCreated] = useState<boolean>(false)
  const onMessage = useCallback(
    (event: EventArgs<'datasetRowsCreated'>) => {
      if (event.datasetId !== createdDatasetId) return

      if (event.error) {
        toast({
          variant: 'destructive',
          title: 'Error generating datasets',
          description: event.error.message,
        })
        return
      }

      setFirstBatchCreated(true)

      // Skip next events and go to dataset detail page now that we
      // know it has rows
      if (firstBatchCreated) return

      toast({
        title: 'Success',
        description: 'Dataset uploaded successfully! 🎉',
      })

      const route = ROUTES.datasets.detail(createdDatasetId)
      navigate.push(`${route}?initialRenderIsProcessing=true`)
    },
    [createdDatasetId, navigate, firstBatchCreated, setFirstBatchCreated],
  )

  useSockets({ event: 'datasetRowsCreated', onMessage })

  return (
    <NewDatasetModalComponent
      open={open}
      onOpenChange={onOpenChange}
      createFormAction={createFormAction}
      isCreating={isCreating || isProcessing}
      createError={createError}
    />
  )
}
