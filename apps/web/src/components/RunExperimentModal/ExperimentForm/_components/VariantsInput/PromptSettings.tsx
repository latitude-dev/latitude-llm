import useModelOptions from '$/hooks/useModelOptions'
import useProviderApiKeys from '$/stores/providerApiKeys'
import { Providers } from '@latitude-data/constants'
import { Input } from '@latitude-data/web-ui/atoms/Input'
import { Select } from '@latitude-data/web-ui/atoms/Select'
import { Skeleton } from '@latitude-data/web-ui/atoms/Skeleton'
import { Slider } from '@latitude-data/web-ui/atoms/Slider'
import { Text } from '@latitude-data/web-ui/atoms/Text'
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
  temperature,
  setTemperature,
}: {
  provider: string
  setProvider: (provider: string) => void
  model: string
  setModel: (model: string) => void
  temperature: number
  setTemperature: (temperature: number) => void
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
    <div className='flex flex-col gap-3'>
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
      {selectedProvider?.provider === Providers.Custom ? (
        <Input
          value={model}
          name='model'
          label='Model'
          placeholder='Enter a model name'
          onChange={(e) => setModel(e.target.value)}
          required
          disabled={isLoadingProviders}
        />
      ) : (
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
      )}
      <div className='flex flex-col gap-2'>
        <Text.H5M>Temperature</Text.H5M>
        <div className='flex flex-row items-center gap-2'>
          <Text.H6
            color={temperature === 0 ? 'accentForeground' : 'foregroundMuted'}
          >
            0
          </Text.H6>
          <div className='relative flex-grow min-w-0'>
            <Slider
              showMiddleRange
              min={0}
              max={2}
              step={0.1}
              value={[temperature]}
              onValueChange={(value) => setTemperature(value[0]!)}
            />
          </div>
          <Text.H6
            color={temperature === 2 ? 'accentForeground' : 'foregroundMuted'}
          >
            2
          </Text.H6>
        </div>
      </div>
    </div>
  )
}
