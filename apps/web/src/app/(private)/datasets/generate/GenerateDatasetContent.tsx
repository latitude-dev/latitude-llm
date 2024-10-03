'use client'

import { ChangeEvent, FormEvent, useState } from 'react'

import { ChainEventTypes, StreamEventTypes } from '@latitude-data/core/browser'
import { syncReadCsv } from '@latitude-data/core/lib/readCsv'
import {
  Alert,
  Badge,
  Button,
  CloseTrigger,
  FormField,
  FormWrapper,
  Icon,
  Input,
  Modal,
  TableSkeleton,
  Text,
  TextArea,
  Tooltip,
} from '@latitude-data/web-ui'
import { generateDatasetAction } from '$/actions/datasets/generateDataset'
import { generateDatasetPreviewAction } from '$/actions/sdk/generateDatasetPreviewAction'
import { useNavigate } from '$/hooks/useNavigate'
import { useStreamableAction } from '$/hooks/useStreamableAction'
import { ROUTES } from '$/services/routes'
import useDatasets from '$/stores/datasets'

import { CsvPreviewTable } from './CsvPreviewTable'
import { LoadingText } from './LoadingText'

export function GenerateDatasetContent() {
  const navigate = useNavigate()
  const [previewCsv, setPreviewCsv] = useState<{
    data: {
      record: Record<string, string>
      info: { columns: { name: string }[] }
    }[]
    headers: string[]
  }>()
  const { data: datasets, mutate } = useDatasets()
  const [explanation, setExplanation] = useState<string | undefined>()
  const [parameters, setParameters] = useState<string[]>([])

  const handleParametersChange = (e: ChangeEvent<HTMLInputElement>) => {
    const parameterList = e.target.value
      .split(',')
      .map((param) => param.trim())
      .filter(Boolean)
    setParameters(parameterList)
  }

  const {
    runAction: runPreviewAction,
    done: previewDone,
    isLoading: previewIsLoading,
    error: previewError,
  } = useStreamableAction<typeof generateDatasetPreviewAction>(
    generateDatasetPreviewAction,
    async (event, data) => {
      if (
        event === StreamEventTypes.Latitude &&
        data.type === ChainEventTypes.Complete
      ) {
        const parsedCsv = await syncReadCsv(data.response.object.csv, {
          delimiter: ',',
        }).then((r) => r.unwrap())
        setPreviewCsv(parsedCsv)
        setExplanation(data.response.object.explanation)
      }
    },
  )

  const {
    runAction: runGenerateAction,
    isLoading: generateIsLoading,
    done: generateIsDone,
    error: generateError,
  } = useStreamableAction<typeof generateDatasetAction>(
    generateDatasetAction,
    async (event, data) => {
      if (
        event === StreamEventTypes.Latitude &&
        data.type === ChainEventTypes.Complete
      ) {
        const parsedCsv = await syncReadCsv(data.response.object.csv, {
          delimiter: ',',
        }).then((r) => r.unwrap())
        setPreviewCsv(parsedCsv)
      }
    },
  )

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const formData = new FormData(e.target as HTMLFormElement)

    if (!previewCsv) {
      await runPreviewAction({
        parameters: formData.get('parameters') as string,
        description: formData.get('description') as string,
      })
    } else {
      const response = await runGenerateAction({
        parameters: formData.get('parameters') as string,
        description: formData.get('description') as string,
        rowCount: parseInt(formData.get('rows') as string, 10),
        name: formData.get('name') as string,
      })

      try {
        const dataset = await response
        if (!dataset) return

        mutate([...datasets, dataset])
        navigate.push(ROUTES.datasets.root)
      } catch (error) {
        console.error(error)
      }
    }
  }

  const handleRegeneratePreview = async () => {
    const form = window.document.getElementById(
      'generateDatasetForm',
    ) as HTMLFormElement
    const formData = new FormData(form)

    await runPreviewAction({
      parameters: formData.get('parameters') as string,
      description: formData.get('description') as string,
    })
  }

  return (
    <Modal
      open
      size='large'
      onOpenChange={(open) => !open && navigate.push(ROUTES.datasets.root)}
      title='Generate new dataset'
      description='Generate a dataset of parameters using AI. Datasets can be used to run batch evaluations over prompts.'
      footer={
        <>
          <CloseTrigger />
          {previewCsv && (
            <Button
              onClick={handleRegeneratePreview}
              disabled={previewIsLoading || generateIsLoading}
              fancy
              variant='outline'
            >
              Regenerate preview
            </Button>
          )}
          <Button
            disabled={previewIsLoading || generateIsLoading}
            fancy
            form='generateDatasetForm'
            type='submit'
          >
            {previewIsLoading || generateIsLoading
              ? 'Generating...'
              : previewCsv
                ? 'Generate dataset'
                : 'Generate preview'}
          </Button>
        </>
      }
    >
      <div className='flex flex-col gap-6'>
        <form
          className='min-w-0'
          id='generateDatasetForm'
          onSubmit={handleSubmit}
        >
          <FormWrapper>
            <FormField label='Name'>
              <Input
                required
                type='text'
                name='name'
                placeholder='Dataset name'
              />
            </FormField>
            <FormField
              label='Parameters'
              info='When you evaluate a prompt, you will map these dataset parameters to your prompt parameters'
            >
              <div className='flex flex-col gap-2'>
                <Input
                  required
                  type='text'
                  name='parameters'
                  placeholder='Enter comma-separated parameters (e.g., name, age, city)'
                  onChange={handleParametersChange}
                />
                {parameters.length > 0 && (
                  <div className='flex flex-col gap-2'>
                    <Text.H6 color='foregroundMuted'>
                      The AI agent will generate a dataset with these
                      parameters:
                    </Text.H6>
                    <div className='flex flex-wrap gap-2'>
                      {parameters.map((param, index) => (
                        <Badge key={index} variant='secondary'>
                          {param}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </FormField>
            <FormField label='Additional instructions'>
              <TextArea
                name='description'
                placeholder='Provide additional context to the LLM agent to help it generate the dataset'
                minRows={3}
                maxRows={5}
              />
            </FormField>
            <FormField
              label='Row count'
              info='AI agent might decide to generate more or less rows than requested'
            >
              <div className='max-w-[200px]'>
                <Input
                  defaultValue={100}
                  max={200}
                  min={0}
                  name='rows'
                  placeholder='Number of rows to generate'
                  type='number'
                />
              </div>
            </FormField>
          </FormWrapper>
        </form>
        {(previewError || generateError) && (
          <Alert
            title='Error'
            description={previewError?.message ?? generateError?.message}
            variant='destructive'
          />
        )}
        {previewIsLoading && !previewDone && (
          <div className='animate-in fade-in slide-in-from-top-5 duration-300 overflow-y-hidden'>
            <TableSkeleton rows={10} cols={parameters.length} maxHeight={320} />
          </div>
        )}
        {previewDone &&
          previewCsv?.data?.length &&
          previewCsv.data.length > 0 && (
            <div className='animate-in fade-in duration-300 flex flex-col gap-2'>
              <CsvPreviewTable csvData={previewCsv} />
              <div className='flex items-start gap-2'>
                <Tooltip trigger={<Icon name='info' color='foregroundMuted' />}>
                  {explanation}
                </Tooltip>
                <Text.H6 color='foregroundMuted'>
                  This is a preview of the dataset. You can generate the
                  complete dataset by clicking the button below.
                </Text.H6>
              </div>
            </div>
          )}

        {generateIsLoading && !generateIsDone && <LoadingText />}
      </div>
    </Modal>
  )
}
