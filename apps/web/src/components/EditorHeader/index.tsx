import { ReactNode, useCallback, useEffect, useMemo, useState } from 'react'

import { ConversationMetadata } from '@latitude-data/compiler'
import {
  findFirstModelForProvider,
  PROVIDER_MODELS,
  ProviderApiKey,
  Providers,
} from '@latitude-data/core/browser'
import {
  AppLocalStorage,
  DropdownMenu,
  FormFieldGroup,
  Icon,
  Select,
  Text,
  Tooltip,
  useLocalStorage,
} from '@latitude-data/web-ui'
import { envClient } from '$/envClient'
import { ROUTES } from '$/services/routes'
import useProviderApiKeys from '$/stores/providerApiKeys'
import Link from 'next/link'

function useModelsOptions({ provider }: { provider: Providers | undefined }) {
  return useMemo(() => {
    const models = provider ? PROVIDER_MODELS[provider] : null
    if (!models) return []

    return Object.keys(models).map((model) => ({
      label: model,
      value: model,
    }))
  }, [provider])
}

type PromptMeta = { providerName: string; model: string }
type IProviderByName = Record<string, ProviderApiKey>
/**
 * @returns the selected model when it exists on the provider's model list,
 * `undefined` when it does not, and `null` when it is not configured.
 */
function selectModel({
  promptMetadata,
  providersByName,
}: {
  promptMetadata: PromptMeta
  providersByName: IProviderByName
}) {
  const inputModel = promptMetadata?.model
  if (!inputModel) return null
  const provider = providersByName[promptMetadata?.providerName]
  const providerModels = provider
    ? PROVIDER_MODELS[provider.provider]
    : undefined
  const selectedModel = providerModels?.[inputModel]
  if (selectedModel) return selectedModel
  return undefined
}

export default function EditorHeader({
  title,
  metadata,
  onChangePrompt,
  rightActions,
  disabledMetadataSelectors = false,
  providers,
  freeRunsCount,
  showCopilotSetting,
}: {
  title: string
  metadata: ConversationMetadata | undefined
  prompt: string
  onChangePrompt: (prompt: string) => void
  rightActions?: ReactNode
  disabledMetadataSelectors?: boolean
  providers?: ProviderApiKey[]
  freeRunsCount?: number
  showCopilotSetting?: boolean
}) {
  const promptMetadata = useMemo<PromptMeta>(() => {
    const config = metadata?.config
    const providerName = config?.provider as string
    const model = config?.model as string
    return { providerName, model }
  }, [metadata?.config])

  const { data: providerApiKeys, isLoading } = useProviderApiKeys({
    fallbackData: providers,
  })

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

  const { value: showCopilot, setValue: setShowCopilot } = useLocalStorage({
    key: AppLocalStorage.editorCopilot,
    defaultValue: true,
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
    const foundProvider = providersByName[promptMetadata?.providerName]
    if (foundProvider?.name === selectedProvider) return

    setProvider(foundProvider?.name)
    setModel(undefined)
  }, [selectedProvider, providersByName, promptMetadata?.providerName])

  useEffect(() => {
    const model = selectModel({
      promptMetadata,
      providersByName,
    })

    if (selectedModel === model) return

    setModel(model)
  }, [
    providersByName,
    selectedModel,
    promptMetadata?.providerName,
    promptMetadata?.model,
  ])

  const onSelectProvider = useCallback(
    (value: string) => {
      if (!metadata) return

      const provider = providersByName[value]!
      if (!provider) return

      setProvider(provider.name)
      const firstModel = findFirstModelForProvider(provider.provider)
      setModel(firstModel)

      const config = metadata.config
      config.provider = provider.name
      config.model = firstModel
      onChangePrompt(metadata.setConfig(config))
    },
    [providersByName, metadata],
  )

  const onModelChange = useCallback(
    (value: string) => {
      if (!metadata) return
      if (!selectedProvider) return

      setModel(value)
      const config = metadata.config
      config.model = value
      onChangePrompt(metadata.setConfig(config))
    },
    [selectedProvider, metadata],
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
              ...(showCopilotSetting
                ? [
                    {
                      label: 'Show Copilot',
                      onClick: () => setShowCopilot(!showCopilot),
                      checked: showCopilot,
                    },
                  ]
                : []),
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
          placeholder='Select a provider'
          options={providerOptions}
          value={selectedProvider}
          disabled={
            disabledMetadataSelectors ||
            isLoading ||
            !providerOptions.length ||
            !metadata
          }
          onChange={onSelectProvider}
        />
        <Select
          disabled={
            isLoading ||
            disabledMetadataSelectors ||
            !selectedProvider ||
            !metadata
          }
          name='model'
          label='Model'
          placeholder={
            selectedModel === undefined ? 'Custom model' : 'Select a model'
          }
          options={modelOptions}
          value={selectedModel || ''}
          onChange={onModelChange}
        />
      </FormFieldGroup>
      {selectedProvider === envClient.NEXT_PUBLIC_DEFAULT_PROJECT_ID && (
        <div>
          {freeRunsCount !== undefined ? (
            <Text.H6 color='foregroundMuted'>
              You have consumed{' '}
              <Tooltip
                trigger={
                  <Text.H6M color='accentForeground'>
                    {freeRunsCount} of 100 daily free runs.
                  </Text.H6M>
                }
              >
                We include the Latitude provider by default with 100 free runs
                to allow you to test the product.
                <br />
                <br />
                <Link
                  href={ROUTES.settings.root}
                  className='flex flex-row items-center gap-1'
                >
                  Set up new provider <Icon name='arrowRight' color='white' />{' '}
                </Link>
              </Tooltip>{' '}
              We highly recommend switching to your own provider.
            </Text.H6>
          ) : (
            <Text.H6 color='foregroundMuted'>
              This provider has a limit of{' '}
              <Tooltip
                trigger={
                  <Text.H6M color='accentForeground'>
                    100 daily free runs.
                  </Text.H6M>
                }
              >
                We include the Latitude provider by default with 100 free runs
                to allow you to test the product.
                <br />
                <br />
                <Link
                  href={ROUTES.settings.root}
                  className='flex flex-row items-center gap-1'
                >
                  Set up new provider <Icon name='arrowRight' color='white' />{' '}
                </Link>
              </Tooltip>{' '}
              We highly recommend switching to your own provider.
            </Text.H6>
          )}
        </div>
      )}
    </div>
  )
}
