'use client'

import { FormEvent, useEffect, useState } from 'react'

import { ConversationMetadata, readMetadata } from '@latitude-data/compiler'
import {
  ChainEventTypes,
  DocumentVersion,
  HEAD_COMMIT,
  StreamEventTypes,
} from '@latitude-data/core/browser'
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
import { ProjectDocumentSelector } from '$/components/ProjectDocumentSelector'
import { useNavigate } from '$/hooks/useNavigate'
import { useStreamableAction } from '$/hooks/useStreamableAction'
import { ROUTES } from '$/services/routes'
import useDatasets from '$/stores/datasets'
import useDocumentVersions from '$/stores/documentVersions'

import { CsvPreviewTable } from './CsvPreviewTable'
import { LoadingText } from './LoadingText'

interface GenerateDatasetContentProps {
  projectId: number
  fallbackDocuments: DocumentVersion[]
}

export function GenerateDatasetContent({
  projectId: fallbackProjectId,
  fallbackDocuments,
}: GenerateDatasetContentProps) {
  const navigate = useNavigate()
  const [documentUuid, setDocumentUuid] = useState<string | undefined>()
  const [metadata, setMetadata] = useState<ConversationMetadata | undefined>()
  const [projectId, setProjectId] = useState<number | undefined>(
    fallbackProjectId,
  )
  const [previewCsv, setPreviewCsv] = useState<{
    data: {
      record: Record<string, string>
      info: { columns: { name: string }[] }
    }[]
    headers: string[]
  }>()
  const { data: datasets, mutate } = useDatasets()
  const [explanation, setExplanation] = useState<string | undefined>()
  const { data: documents } = useDocumentVersions(
    {
      commitUuid: HEAD_COMMIT,
      projectId,
    },
    { fallbackData: fallbackDocuments },
  )
  const document = documents?.find(
    (document) => document.documentUuid === documentUuid,
  )

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

  const handleProjectChange = (projectId: number) => {
    setProjectId(projectId)
  }

  const handleDocumentChange = (newDocumentUuid: string) => {
    setDocumentUuid(newDocumentUuid)
  }

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

  useEffect(() => {
    const fetchMetadata = async () => {
      if (document) {
        const metadata = await readMetadata({
          prompt: document.resolvedContent ?? '',
          fullPath: document.path,
        })

        setMetadata(metadata)
      }
    }

    fetchMetadata()
  }, [document])

  return (
    <Modal
      open
      size='large'
      onOpenChange={(open) => !open && navigate.push(ROUTES.datasets.root)}
      title='Generate new dataset'
      description='Generate a dataset of parameters using AI from one of your prompts. Datasets can be used to run batch evaluations over prompts.'
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
            disabled={!documentUuid || previewIsLoading || generateIsLoading}
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
            <ProjectDocumentSelector
              defaultProjectId={fallbackProjectId}
              documents={documents}
              onProjectChange={handleProjectChange}
              onDocumentChange={handleDocumentChange}
              labelInfo='Datasets can only be generated from live versions of prompts'
            />
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
        {metadata && <ParametersList parameters={metadata?.parameters} />}
        {(previewError || generateError) && (
          <Alert
            title='Error'
            description={previewError?.message ?? generateError?.message}
            variant='destructive'
          />
        )}
        {previewIsLoading && !previewDone && !!metadata && (
          <div className='animate-in fade-in slide-in-from-top-5 duration-300 overflow-y-hidden'>
            <TableSkeleton
              rows={10}
              cols={metadata.parameters.size}
              maxHeight={320}
            />
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

function ParametersList({ parameters }: { parameters: Set<string> }) {
  return (
    <div className='flex flex-col gap-2'>
      <Text.H5 color='foregroundMuted'>
        The agent will generate synthetic data for these parameters:
      </Text.H5>
      <div className='flex flex-wrap gap-2'>
        {Array.from(parameters).map((parameter, index) => (
          <Badge key={index} variant='secondary'>
            {parameter}
          </Badge>
        ))}
      </div>
    </div>
  )
}
