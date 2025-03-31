'use client'
import { FormEvent } from 'react'

import {
  EvaluationConfigurationText,
  EvaluationDto,
  EvaluationMetadataLlmAsJudgeSimple,
  EvaluationMetadataType,
  EvaluationResultableType,
} from '@latitude-data/core/browser'
import { FormField } from '@latitude-data/web-ui/atoms/FormField'
import { Input } from '@latitude-data/web-ui/atoms/Input'
import { Label } from '@latitude-data/web-ui/atoms/Label'
import { useToast } from '@latitude-data/web-ui/atoms/Toast'
import { ProviderModelSelector } from '$/components/EditorHeader'
import useEvaluations from '$/stores/evaluations'

import { EvaluationEditorLayout } from '../components/EvaluationEditorLayout'
import { useProviderModel } from '../hooks/useProviderModel'

export default function TextEvaluationEditor({
  evaluation,
}: {
  evaluation: EvaluationDto
}) {
  const { toast } = useToast()
  const metadata = evaluation.metadata as EvaluationMetadataLlmAsJudgeSimple
  const resultConfiguration =
    evaluation.resultConfiguration as EvaluationConfigurationText
  const { update } = useEvaluations()

  const {
    provider,
    selectedProvider,
    selectedModel,
    providerOptions,
    modelOptions,
    onProviderChange,
    onModelChange,
  } = useProviderModel(metadata)

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)

    const [_, error] = await update({
      id: evaluation.id,
      metadata: {
        type: EvaluationMetadataType.LlmAsJudgeSimple,
        providerApiKeyId: provider?.id,
        model: selectedModel ?? undefined,
        objective: formData.get('objective') as string,
        additionalInstructions: formData.get(
          'additionalInstructions',
        ) as string,
      },
      configuration: {
        type: EvaluationResultableType.Text,
        valueDescription: formData.get('valueDescription') as string,
      },
    })
    if (error) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      })
    }
  }

  return (
    <EvaluationEditorLayout
      evaluationId={evaluation.id}
      name={evaluation.name}
      formId='simple-text-evaluation-editor'
      onSubmit={onSubmit}
    >
      <FormField>
        <ProviderModelSelector
          modelDisabled={!modelOptions.length || !selectedProvider}
          modelOptions={modelOptions}
          onModelChange={onModelChange}
          onProviderChange={onProviderChange}
          providerDisabled={!providerOptions.length}
          providerOptions={providerOptions}
          selectedModel={selectedModel}
          selectedProvider={selectedProvider}
        />
      </FormField>
      <FormField label='Evaluation objective'>
        <Input
          name='objective'
          defaultValue={metadata.objective}
          placeholder='The main objective of the evaluation'
        />
      </FormField>
      <FormField label='Value description'>
        <Input
          name='valueDescription'
          defaultValue={resultConfiguration.valueDescription ?? ''}
          placeholder='Description of the evaluation output value'
        />
      </FormField>
      <div className='flex flex-col gap-2 flex-grow'>
        <Label>Additional instructions</Label>
        <textarea
          name='additionalInstructions'
          className='w-full h-full border rounded-lg p-2 text-sm text-foreground'
          defaultValue={metadata.additionalInstructions ?? ''}
          placeholder='Additional instructions the eval should take into account...'
        />
      </div>
    </EvaluationEditorLayout>
  )
}
