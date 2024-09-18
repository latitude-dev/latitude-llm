import { ReactNode, useCallback, useEffect, useMemo, useState } from 'react'

import { ConversationMetadata } from '@latitude-data/compiler'
import {
  PROVIDER_MODELS,
  ProviderApiKey,
  Providers,
} from '@latitude-data/core/browser'
import {
  AppLocalStorage,
  DropdownMenu,
  FormFieldGroup,
  Select,
  Text,
  useLocalStorage,
} from '@latitude-data/web-ui'
import { useWritePromptProvider } from '$/components/EditorHeader/useWritePromptProvider'
import useProviderApiKeys from '$/stores/providerApiKeys'

const CUSTOM_MODEL = 'custom-model'
function useModelsOptions({ provider }: { provider: Providers | undefined }) {
  return useMemo(() => {
    const models = provider ? PROVIDER_MODELS[provider] : null
    if (!models) return []

    const options = Object.keys(models).map((model) => ({
      label: model,
      value: model,
    }))
    return [...options, { label: 'Custom Model', value: CUSTOM_MODEL }]
  }, [provider])
}

type PromptMeta = { providerName: string; model: string }
type IProviderByName = Record<string, ProviderApiKey>
function selectModel({
  promptMetadata,
  providersByName,
}: {
  promptMetadata: PromptMeta
  providersByName: IProviderByName
}) {
  const found = providersByName[promptMetadata?.providerName]
  const models = found ? PROVIDER_MODELS[found.provider] : null
  const model = promptMetadata?.model
  const modelInModels = models ? models[model] : undefined
  return modelInModels ? modelInModels : model ? CUSTOM_MODEL : undefined
}

export default function EditorHeader({
  title,
  prompt,
  metadata,
  onChangePrompt,
  rightActions,
  disabledMetadataSelectors = false,
}: {
  title: string
  metadata: ConversationMetadata | undefined
  prompt: string
  onChangePrompt: (prompt: string) => void
  rightActions?: ReactNode
  disabledMetadataSelectors?: boolean
}) {
  const promptMetadata = useMemo<PromptMeta>(() => {
    const config = metadata?.config
    const providerName = config?.provider as string
    const model = config?.model as string
    return { providerName, model }
  }, [metadata?.config])
  const { data: providerApiKeys, isLoading } = useProviderApiKeys()
  const { value: showLineNumbers, setValue: setShowLineNumbers } =
    useLocalStorage({
      key: AppLocalStorage.editorLineNumbers,
      defaultValue: true,
    })
  const { value: wrapText, setValue: setWrapText } = useLocalStorage({
    key: AppLocalStorage.editorWrapText,
    defaultValue: true,
  })
  const { value: showMinimap, setValue: setShowMinimap } = useLocalStorage({
    key: AppLocalStorage.editorMinimap,
    defaultValue: false,
  })
  const { onProviderDataChange } = useWritePromptProvider({
    prompt,
    onChangePrompt,
  })
  const providersByName = useMemo(() => {
    return providerApiKeys.reduce((acc, data) => {
      acc[data.name] = data
      return acc
    }, {} as IProviderByName)
  }, [isLoading, providerApiKeys])
  const [selectedProvider, setProvider] = useState<string | undefined>()
  const [selectedModel, setModel] = useState<string | undefined | null>(() =>
    selectModel({
      promptMetadata,
      providersByName,
    }),
  )
  const providerOptions = useMemo(() => {
    return providerApiKeys.map((apiKey) => ({
      label: apiKey.name,
      value: apiKey.name,
    }))
  }, [providerApiKeys])
  const modelOptions = useModelsOptions({
    provider: selectedProvider
      ? providersByName[selectedProvider]?.provider
      : undefined,
  })
  useEffect(() => {
    if (isLoading) return

    const foundProvider = providersByName[promptMetadata?.providerName]
    if (foundProvider?.name === selectedProvider) return

    setProvider(foundProvider?.name)
    setModel(undefined)
  }, [
    isLoading,
    selectedProvider,
    providersByName,
    promptMetadata?.providerName,
  ])
  useEffect(() => {
    if (isLoading) return

    const model = selectModel({
      promptMetadata,
      providersByName,
    })

    if (selectedModel === model) return

    setModel(model)
  }, [
    isLoading,
    providersByName,
    selectedModel,
    promptMetadata?.providerName,
    promptMetadata?.model,
  ])
  const onSelectProvider = useCallback(
    (value: string) => {
      const provider = providersByName[value]!
      if (!provider) return

      setProvider(provider.name)
      const firstModel = Object.keys(
        PROVIDER_MODELS[provider.provider] ?? {},
      )[0]
      setModel(firstModel)
      onProviderDataChange({
        name: provider.name,
        model: firstModel,
      })
    },
    [providersByName, onProviderDataChange],
  )
  const onModelChange = useCallback(
    (value: string) => {
      if (value === CUSTOM_MODEL) return
      if (!selectedProvider) return

      setModel(value)
      onProviderDataChange({
        name: selectedProvider,
        model: value,
      })
    },
    [onProviderDataChange, selectedProvider],
  )

  return (
    <div className='flex flex-col gap-y-2'>
      <div className='flex flex-row h-8 justify-between items-center'>
        <Text.H4M>{title}</Text.H4M>
        <div className='flex flex-row gap-2'>
          {rightActions}
          <DropdownMenu
            options={[
              {
                label: 'Show line numbers',
                onClick: () => setShowLineNumbers(!showLineNumbers),
                checked: showLineNumbers,
              },
              {
                label: 'Wrap text',
                onClick: () => setWrapText(!wrapText),
                checked: wrapText,
              },
              {
                label: 'Show minimap',
                onClick: () => setShowMinimap(!showMinimap),
                checked: showMinimap,
              },
            ]}
            side='bottom'
            align='end'
          />
        </div>
      </div>
      <FormFieldGroup>
        <Select
          name='provider'
          label='Provider'
          placeholder='Using default provider'
          options={providerOptions}
          value={selectedProvider}
          disabled={
            disabledMetadataSelectors || isLoading || !providerOptions.length
          }
          onChange={onSelectProvider}
        />
        <Select
          disabled={disabledMetadataSelectors || !selectedProvider}
          name='model'
          label='Model'
          placeholder='Select a model'
          options={modelOptions}
          value={selectedModel as string}
          onChange={onModelChange}
        />
      </FormFieldGroup>
    </div>
  )
}
