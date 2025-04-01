'use client'
import { FormEvent } from 'react'

import {
  EvaluationConfigurationBoolean,
  EvaluationDto,
  EvaluationMetadataLlmAsJudgeSimple,
  EvaluationMetadataType,
  EvaluationResultableType,
} from '@latitude-data/core/browser'
import { FormField } from '@latitude-data/web-ui/atoms/FormField'
import { FormFieldGroup } from '@latitude-data/web-ui/atoms/FormFieldGroup'
import { Input } from '@latitude-data/web-ui/atoms/Input'
import { Label } from '@latitude-data/web-ui/atoms/Label'
import { useToast } from '@latitude-data/web-ui/atoms/Toast'
import { ProviderModelSelector } from '$/components/EditorHeader'
import useEvaluations from '$/stores/evaluations'

import { EvaluationEditorLayout } from '../components/EvaluationEditorLayout'
import { useProviderModel } from '../hooks/useProviderModel'

export default function BooleanEvaluationEditor({
  evaluation,
}: {
  evaluation: EvaluationDto
}) {
  const { toast } = useToast()
  const metadata = evaluation.metadata as EvaluationMetadataLlmAsJudgeSimple
  const resultConfiguration =
    evaluation.resultConfiguration as EvaluationConfigurationBoolean
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
        type: EvaluationResultableType.Boolean,
        trueValueDescription: formData.get('trueValueDescription') as string,
        falseValueDescription: formData.get('falseValueDescription') as string,
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
      name={evaluation.name}
      evaluationId={evaluation.id}
      formId='simple-boolean-evaluation-editor'
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
      <FormFieldGroup>
        <FormField label='True value description'>
          <Input
            name='trueValueDescription'
            defaultValue={resultConfiguration.trueValueDescription ?? ''}
            placeholder='Description of the true value'
          />
        </FormField>
        <FormField label='False value description'>
          <Input
            name='falseValueDescription'
            defaultValue={resultConfiguration.falseValueDescription ?? ''}
            placeholder='Description of the false value'
          />
        </FormField>
      </FormFieldGroup>
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
