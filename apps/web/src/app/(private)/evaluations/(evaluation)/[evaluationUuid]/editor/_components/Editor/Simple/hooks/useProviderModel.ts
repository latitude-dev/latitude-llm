import { useEffect, useMemo, useState } from 'react'

import {
  EvaluationMetadataLlmAsJudgeSimple,
  findFirstModelForProvider,
} from '@latitude-data/core/browser'
import { IProviderByName } from '$/components/EditorHeader'
import { envClient } from '$/envClient'
import useModelOptions from '$/hooks/useModelOptions'
import useProviderApiKeys from '$/stores/providerApiKeys'

export function useProviderModel(metadata: EvaluationMetadataLlmAsJudgeSimple) {
  const { data: providerApiKeys } = useProviderApiKeys()
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
  }, [providerApiKeys, metadata])

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

    const firstModel = findFirstModelForProvider({
      provider: providersByName[value],
      latitudeProvider: envClient.NEXT_PUBLIC_DEFAULT_PROJECT_ID,
    })

    setSelectedProvider(value)
    setSelectedModel(firstModel)
  }

  const onModelChange = async (value: string) => {
    if (!value) return
    if (value === selectedModel) return

    setSelectedModel(value)
  }

  return {
    provider,
    selectedProvider,
    selectedModel,
    providerOptions,
    modelOptions,
    onProviderChange,
    onModelChange,
  }
}
