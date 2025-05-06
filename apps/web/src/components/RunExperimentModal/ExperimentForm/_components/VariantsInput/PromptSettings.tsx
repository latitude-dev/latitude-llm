import useModelOptions from '$/hooks/useModelOptions'
import useProviderApiKeys from '$/stores/providerApiKeys'
import { Select } from '@latitude-data/web-ui/atoms/Select'
import { Skeleton } from '@latitude-data/web-ui/atoms/Skeleton'
import { useMemo } from 'react'

export function VariantPromptSettingsPlaceholder() {
  return (
    <div className='flex flex-col gap-2'>
      <Skeleton height='h4' className='w-full' />
    </div>
  )
}

export function VariantPromptSettings({
  provider,
  setProvider,
  model,
  setModel,
}: {
  provider: string
  setProvider: (provider: string) => void
  model: string
  setModel: (model: string) => void
}) {
  const { data: providers, isLoading: isLoadingProviders } =
    useProviderApiKeys()

  const selectedProvider = useMemo(() => {
    return providers.find((p) => p.name === provider)
  }, [provider, providers])

  const modelOptions = useModelOptions({
    provider: selectedProvider?.provider,
    name: selectedProvider?.name,
  })

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
          setProvider(value as string)
          setModel(newProvider?.defaultModel ?? '')
        }}
        loading={isLoadingProviders}
        required
      />
      <Select
        value={model}
        name='model'
        label='Model'
        placeholder='Select a model'
        options={modelOptions}
        onChange={(value) => setModel(value as string)}
        loading={isLoadingProviders}
        required
      />
    </div>
  )
}
