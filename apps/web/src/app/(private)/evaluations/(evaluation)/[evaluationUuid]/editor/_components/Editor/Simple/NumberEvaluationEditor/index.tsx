'use client'

import { FormEvent, useEffect, useMemo, useState } from 'react'

import {
  EvaluationConfigurationNumerical,
  EvaluationDto,
  EvaluationMetadataLlmAsJudgeSimple,
  EvaluationMetadataType,
  EvaluationResultableType,
  findFirstModelForProvider,
} from '@latitude-data/core/browser'
import {
  Button,
  FormFieldGroup,
  Input,
  Text,
  TextArea,
  useToast,
} from '@latitude-data/web-ui'
import {
  IProviderByName,
  ProviderModelSelector,
} from '$/components/EditorHeader'
import { envClient } from '$/envClient'
import useModelOptions from '$/hooks/useModelOptions'
import useEvaluations from '$/stores/evaluations'
import useProviderApiKeys from '$/stores/providerApiKeys'

export default function NumberEvaluationEditor({
  evaluation,
}: {
  evaluation: EvaluationDto
}) {
  const { toast } = useToast()
  const { data: providerApiKeys } = useProviderApiKeys()
  const metadata = evaluation.metadata as EvaluationMetadataLlmAsJudgeSimple
  const resultConfiguration =
    evaluation.resultConfiguration as EvaluationConfigurationNumerical
  const [selectedProvider, setSelectedProvider] = useState<string | undefined>()
  const [selectedModel, setSelectedModel] = useState<
    string | undefined | null
  >()
  useEffect(() => {
    const provider = providerApiKeys.find(
      (pk) => pk.id === metadata.providerApiKeyId,
    )
    if (!provider) return

    setSelectedProvider(provider.name)
    setSelectedModel(metadata.model)
  }, [providerApiKeys])

  const { update } = useEvaluations()

  const providerOptions = useMemo(() => {
    return providerApiKeys.map((apiKey) => ({
      label: apiKey.name,
      value: apiKey.name,
    }))
  }, [providerApiKeys])
  const providersByName = useMemo(() => {
    return providerApiKeys.reduce((acc, data) => {
      acc[data.name] = data
      return acc
    }, {} as IProviderByName)
  }, [providerApiKeys])
  const provider = selectedProvider
    ? providersByName[selectedProvider]
    : undefined
  const modelOptions = useModelOptions({
    provider: provider?.provider,
    name: provider?.name,
  })
  const onProviderChange = async (value: string) => {
    if (!value) return
    if (value === selectedProvider) return

    let firstModel
    if (providersByName[value]) {
      firstModel = findFirstModelForProvider({
        provider: providersByName[value],
        latitudeProvider: envClient.NEXT_PUBLIC_DEFAULT_PROJECT_ID,
      })
    }

    setSelectedProvider(value)
    setSelectedModel(firstModel)
  }
  const onModelChange = async (value: string) => {
    if (!value) return
    if (value === selectedModel) return

    setSelectedModel(value)
  }
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
    <div className='flex flex-col gap-y-2 h-full'>
      <div className='flex flex-row items-center justify-between'>
        <Text.H4M>{evaluation.name}</Text.H4M>
        <Button fancy form='simple-number-evaluation-editor' type='submit'>
          Save changes
        </Button>
      </div>
      <form
        className='bg-backgroundCode flex flex-grow flex-col gap-y-4 p-4 rounded-lg border'
        id='simple-number-evaluation-editor'
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
      </form>
    </div>
  )
}
