'use client'

import { FormEvent, useEffect, useMemo, useState } from 'react'

import {
  EvaluationConfigurationBoolean,
  EvaluationDto,
  EvaluationMetadataLlmAsJudgeSimple,
  EvaluationMetadataType,
  EvaluationResultableType,
  findFirstModelForProvider,
} from '@latitude-data/core/browser'
import {
  Button,
  FormField,
  FormFieldGroup,
  Input,
  Label,
  Text,
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

export default function BooleanEvaluationEditor({
  evaluation,
}: {
  evaluation: EvaluationDto
}) {
  const { toast } = useToast()
  const { data: providerApiKeys } = useProviderApiKeys()
  const metadata = evaluation.metadata as EvaluationMetadataLlmAsJudgeSimple
  const resultConfiguration =
    evaluation.resultConfiguration as EvaluationConfigurationBoolean
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
    <div className='flex flex-col gap-y-2 h-full'>
      <div className='flex flex-row items-center justify-between'>
        <Text.H4M>{evaluation.name}</Text.H4M>
        <Button fancy form='simple-boolean-evaluation-editor' type='submit'>
          Save changes
        </Button>
      </div>
      <form
        className='bg-backgroundCode flex flex-grow flex-col gap-y-4 p-4 rounded-lg border'
        id='simple-boolean-evaluation-editor'
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
      </form>
    </div>
  )
}
