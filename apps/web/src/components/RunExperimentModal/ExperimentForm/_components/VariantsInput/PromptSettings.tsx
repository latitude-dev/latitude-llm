import useModelOptions from '$/hooks/useModelOptions'
import { updatePromptMetadata } from '$/lib/promptMetadata'
import useProviderApiKeys from '$/stores/providerApiKeys'
import { Select } from '@latitude-data/web-ui/atoms/Select'
import { Skeleton } from '@latitude-data/web-ui/atoms/Skeleton'
import { Config, ConversationMetadata } from 'promptl-ai'
import { useCallback, useMemo } from 'react'

export function VariantPromptSettingsPlaceholder() {
  return (
    <div className='flex flex-col gap-2'>
      <Skeleton height='h4' className='w-full' />
    </div>
  )
}

export function VariantPromptSettings({
  prompt,
  setPrompt,
  metadata,
}: {
  prompt: string
  setPrompt: (prompt: string) => void
  metadata?: ConversationMetadata
}) {
  const { data: providers, isLoading: isLoadingProviders } =
    useProviderApiKeys()

  const setConfig = useCallback(
    (newConfig: Config) => {
      const newPrompt = updatePromptMetadata(prompt, newConfig)
      setPrompt(newPrompt)
    },
    [prompt, setPrompt],
  )
  const selectedProvider = useMemo(() => {
    if (!metadata) return undefined
    const provider = providers.find((p) => p.name === metadata.config.provider)
    return provider
  }, [metadata, providers])

  const modelOptions = useModelOptions({
    provider: selectedProvider?.provider,
    name: selectedProvider?.name,
  })

  if (!metadata) {
    return <VariantPromptSettingsPlaceholder />
  }

  return (
    <div className='flex flex-col gap-2'>
      <Select
        value={selectedProvider?.name}
        name='provider'
        label='Provider'
        placeholder='Select a provider'
        options={providers.map((provider) => ({
          value: provider.name,
          label: provider.name,
        }))}
        onChange={(value) => {
          const newProvider = providers.find((p) => p.name === value)
          setConfig({
            provider: value,
            model: newProvider?.defaultModel,
          })
        }}
        loading={isLoadingProviders}
        required
      />
      <Select
        value={metadata?.config.model}
        name='model'
        label='Model'
        placeholder='Select a model'
        options={modelOptions}
        onChange={(value) =>
          setConfig({
            model: value,
          })
        }
        loading={isLoadingProviders}
        required
      />
    </div>
  )
}
