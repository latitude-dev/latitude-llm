import { FormEvent, useCallback, useRef, useState } from 'react'
import { DropzoneInput } from '@latitude-data/web-ui/atoms/DropzoneInput'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { FormWrapper } from '@latitude-data/web-ui/atoms/FormWrapper'
import { Input } from '@latitude-data/web-ui/atoms/Input'
import { Modal } from '@latitude-data/web-ui/atoms/Modal'
import { useToast } from '@latitude-data/web-ui/atoms/Toast'
import { CloseTrigger } from '@latitude-data/web-ui/atoms/Modal'
import { useNavigate } from '$/hooks/useNavigate'
import { ROUTES } from '$/services/routes'
import useDatasets from '$/stores/datasets'
import DelimiterSelector from '$/app/(private)/datasets/_components/DelimiterSelector'
import { Dataset } from '@latitude-data/core/schema/models/types/Dataset'
import { MAX_UPLOAD_SIZE_IN_MB, MAX_SIZE } from '@latitude-data/core/constants'

const MAX_SIZE_MESSAGE = `Your dataset must be less than ${MAX_SIZE}MB in size.`

export function NewDatasetModalComponent({
  open,
  onOpenChange,
  onDatasetCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onDatasetCreated: (dataset: Dataset) => void
}) {
  const { createError, createDataset, isCreating } = useDatasets({
    onCreateSuccess: onDatasetCreated,
  })
  const formRef = useRef<HTMLFormElement>(null)
  const [clientErrors, setClientErrors] = useState<Record<string, string[]>>({})
  const errors = { ...createError?.fieldErrors, ...clientErrors }
  const handleFileSizeError = useCallback(() => {
    setClientErrors({ dataset_file: [MAX_SIZE_MESSAGE] })
  }, [])

  const onChange = useCallback(() => {
    setClientErrors({})
  }, [])

  const handleSubmit = useCallback(
    (e: FormEvent) => {
      e.preventDefault()

      const formData = new FormData(e.currentTarget as HTMLFormElement)
      createDataset(formData)
    },
    [createDataset],
  )

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
        ref={formRef}
        className='min-w-0'
        id='createDatasetForm'
        onSubmit={handleSubmit}
      >
        <FormWrapper>
          <Input
            type='text'
            name='name'
            label='Name'
            errors={errors?.name}
            placeholder='Amazing dataset'
          />
          <DelimiterSelector
            delimiterInputName='csvDelimiter'
            delimiterErrors={errors?.csvDelimiter}
            customDelimiterInputName='csvCustomDelimiter'
            customDelimiterValue={''}
            delimiterDefaultValue='comma'
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
            maxFileSize={MAX_UPLOAD_SIZE_IN_MB}
            onFileSizeError={handleFileSizeError}
            onChange={onChange}
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
  const onDatasetCreated = useCallback(
    (dataset: Dataset) => {
      if (!dataset) return

      toast({
        title: 'Success',
        description: 'Dataset uploaded successfully! 🎉',
      })
      const route = ROUTES.datasets.detail(dataset.id)
      navigate.push(`${route}?initialRenderIsProcessing=true`)
    },
    [navigate, toast],
  )

  if (!open) return null

  return (
    <NewDatasetModalComponent
      open={open}
      onOpenChange={onOpenChange}
      onDatasetCreated={onDatasetCreated}
    />
  )
}
