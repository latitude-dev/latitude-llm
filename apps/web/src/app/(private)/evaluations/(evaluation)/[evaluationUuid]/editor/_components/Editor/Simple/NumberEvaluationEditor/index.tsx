'use client'
import { FormEvent } from 'react'

import {
  EvaluationConfigurationNumerical,
  EvaluationDto,
  EvaluationMetadataLlmAsJudgeSimple,
  EvaluationMetadataType,
  EvaluationResultableType,
} from '@latitude-data/core/browser'
import { FormFieldGroup } from '@latitude-data/web-ui/atoms/FormFieldGroup'
import { Input } from '@latitude-data/web-ui/atoms/Input'
import { TextArea } from '@latitude-data/web-ui/atoms/TextArea'
import { useToast } from '@latitude-data/web-ui/atoms/Toast'
import { ProviderModelSelector } from '$/components/EditorHeader'
import useEvaluations from '$/stores/evaluations'

import { EvaluationEditorLayout } from '../components/EvaluationEditorLayout'
import { useProviderModel } from '../hooks/useProviderModel'

export default function NumberEvaluationEditor({
  evaluation,
}: {
  evaluation: EvaluationDto
}) {
  const { toast } = useToast()
  const metadata = evaluation.metadata as EvaluationMetadataLlmAsJudgeSimple
  const resultConfiguration =
    evaluation.resultConfiguration as EvaluationConfigurationNumerical
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
        type: EvaluationResultableType.Number,
        minValue: Number(formData.get('minValue')),
        maxValue: Number(formData.get('maxValue')),
        minValueDescription: formData.get('minValueDescription') as string,
        maxValueDescription: formData.get('maxValueDescription') as string,
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
      formId='simple-number-evaluation-editor'
      onSubmit={onSubmit}
    >
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
      <Input
        name='objective'
        label='Evaluation objective'
        defaultValue={metadata.objective}
        placeholder='The main objective of the evaluation'
      />
      <FormFieldGroup>
        <Input
          label='Min Value'
          type='number'
          name='minValue'
          defaultValue={resultConfiguration.minValue}
        />
        <Input
          label='Min value description'
          name='minValueDescription'
          defaultValue={resultConfiguration.minValueDescription ?? ''}
          placeholder='Description of the min value'
        />
      </FormFieldGroup>
      <FormFieldGroup>
        <Input
          label='Max Value'
          type='number'
          name='maxValue'
          defaultValue={resultConfiguration.maxValue}
        />
        <Input
          label='Max value description'
          name='maxValueDescription'
          defaultValue={resultConfiguration.maxValueDescription ?? ''}
          placeholder='Description of the max value'
        />
      </FormFieldGroup>
      <TextArea
        autoGrow
        label='Additional instructions'
        name='additionalInstructions'
        placeholder='Additional instructions the eval should take into account...'
        defaultValue={metadata.additionalInstructions ?? ''}
      />
    </EvaluationEditorLayout>
  )
}
