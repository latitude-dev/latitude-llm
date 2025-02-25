'use client'

import { ChangeEvent, FormEvent, useEffect, useState } from 'react'

import {
  Alert,
  Badge,
  Button,
  CloseTrigger,
  cn,
  FormField,
  FormWrapper,
  Icon,
  Input,
  LoadingText,
  Modal,
  TableSkeleton,
  Text,
  TextArea,
  Tooltip,
  useToast,
} from '@latitude-data/web-ui'
import { generateDatasetAction } from '$/actions/datasetsV2/generateDataset'
import { generateDatasetPreviewAction } from '$/actions/sdk/generateDatasetPreviewAction'
import { useNavigate } from '$/hooks/useNavigate'
import { ROUTES } from '$/services/routes'
import useDatasets from '$/stores/datasetsV2'
import Link from 'next/link'

import { CsvPreviewTable } from './CsvPreviewTable'
import { useServerAction } from 'zsa-react'

export function GenerateDatasetModal({
  defaultParameters,
  defaultName,
  backUrl,
}: {
  defaultParameters: string[]
  defaultName?: string
  backUrl?: string
}) {
  const { toast } = useToast()
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
  const [parameters, setParameters] = useState<string[]>(defaultParameters)

  const handleParametersChange = (e: ChangeEvent<HTMLInputElement>) => {
    const parameterList = e.target.value
      .split(',')
      .map((param) => param.trim())
      .filter(Boolean)
    setParameters(parameterList)
  }

  const {
    execute: runPreviewAction,
    isPending: previewIsLoading,
    error: previewError,
  } = useServerAction(generateDatasetPreviewAction, {
    onError: (error) => {
      toast({
        title: 'Failed to generate dataset',
        description: error.err.message,
        variant: 'destructive',
      })
    },
  })

  const {
    execute: runGenerateAction,
    isPending: generateIsLoading,
    error: generateError,
  } = useServerAction(generateDatasetAction, {
    onError: (error) => {
      toast({
        title: 'Failed to generate dataset',
        description: error.err.message,
        variant: 'destructive',
      })
    },
  })

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const formData = new FormData(e.target as HTMLFormElement)

    if (!previewCsv) {
      const [data] = await runPreviewAction({
        parameters: formData.get('parameters') as string,
        description: formData.get('description') as string,
      })
      if (!data) return

      setPreviewCsv(data.parsedCsv)
      setExplanation(data.explanation)
    } else {
      const [dataset] = await runGenerateAction({
        parameters: formData.get('parameters') as string,
        description: formData.get('description') as string,
        rowCount: parseInt(formData.get('rows') as string, 10),
        name: formData.get('name') as string,
      })

      if (!dataset) return

      mutate([...datasets, dataset])
      toast({
        title: 'Success',
        description: 'Dataset generated succesfully',
      })

      // TODO: What to when backUrl
      if (backUrl) {
        navigate.push(backUrl)
      } else {
        navigate.push(ROUTES.datasetsV2.detail(dataset.id))
      }
    }
  }
  const previewDone = previewCsv && explanation

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

  useEffect(() => {
    if (defaultName && defaultParameters && runPreviewAction) {
      runPreviewAction({
        parameters: defaultParameters.join(','),
        description: defaultName,
      })
    }
  }, [defaultName, defaultParameters])

  return (
    <Modal
      open
      size='large'
      onOpenChange={(open) => !open && navigate.push(ROUTES.datasetsV2.root)}
      title='Generate new dataset'
      description='Generate a dataset of parameters using AI. Datasets can be used to run batch evaluations over prompts.'
      footer={
        <div className='flex flex-col gap-y-4 w-full'>
          <div
            className={cn('w-full flex flex-row flex-grow gap-4', {
              'justify-between': !!backUrl,
              'justify-end': !backUrl,
            })}
          >
            {backUrl && (
              <Link href={backUrl}>
                <Button variant='link'>
                  <Icon name='arrowLeft' /> Go back
                </Button>
              </Link>
            )}
            <div className='flex flex-row gap-2'>
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
            </div>
          </div>
          <div className='justify-end flex-grow'>
            {generateIsLoading && <LoadingText />}
          </div>
        </div>
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
                defaultValue={defaultName}
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
                  defaultValue={defaultParameters?.join(', ')}
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
            <FormField
              label='Additional instructions'
              info='Provide additional context about each parameter to the LLM agent to help it generate the dataset'
            >
              <TextArea
                name='description'
                placeholder='Provide additional context to the LLM agent to help it generate the dataset'
                minRows={3}
                maxRows={5}
              />
            </FormField>
            {previewCsv ? (
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
            ) : null}
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
      </div>
    </Modal>
  )
}
