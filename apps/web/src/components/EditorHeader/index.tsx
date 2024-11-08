import { ReactNode, useCallback, useEffect, useMemo, useState } from 'react'
import { omit } from 'lodash-es'

import { ConversationMetadata } from '@latitude-data/compiler'
import {
  findFirstModelForProvider,
  PROVIDER_MODELS,
  ProviderApiKey,
  Providers,
} from '@latitude-data/core/browser'
import { DEFAULT_PROVIDER_UNSUPPORTED_MODELS } from '@latitude-data/core/services/ai/providers/models/index'
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
import { parse, stringify } from 'yaml'

export function useModelsOptions({
  provider,
  isDefaultProvider = false,
}: {
  provider: Providers | undefined
  isDefaultProvider?: boolean
}) {
  return useMemo(() => {
    let models = provider ? PROVIDER_MODELS[provider] : null
    if (!models) return []

    if (isDefaultProvider) {
      models = omit(models, DEFAULT_PROVIDER_UNSUPPORTED_MODELS)
    }

    return Object.keys(models).map((model) => ({
      label: model,
      value: model,
    }))
  }, [provider, isDefaultProvider])
}

type PromptMeta = { providerName: string; model: string }
export type IProviderByName = Record<string, ProviderApiKey>
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

function extractFrontMatter(content: string) {
  const match = content.match(/(?:\/\*[\s\S]*?\*\/\s*)?---\n([\s\S]*?)\n---/)
  return match ? match[1] : null
}

export function updatePromptMetadata(
  prompt: string,
  updates: Record<string, any>,
) {
  // Check if the prompt has frontmatter
  if (!prompt.match(/(?:\/\*[\s\S]*?\*\/\s*)?---/)) {
    // If no frontmatter exists, create one with the updates
    const newFrontMatter = stringify(updates)
    return `---\n${newFrontMatter}---\n\n${prompt}`
  }

  try {
    const frontMatter = extractFrontMatter(prompt)
    if (!frontMatter) {
      // Invalid frontmatter format, create new one
      const newFrontMatter = stringify(updates)
      return `---\n${newFrontMatter}---\n\n${prompt.replace(/(?:\/\*[\s\S]*?\*\/\s*)?---\n[\s\S]*?\n---\n/, '')}`
    }

    // Parse existing frontmatter
    const parsed = parse(frontMatter) || {}

    // Merge updates with existing frontmatter
    const updated = {
      ...parsed,
      ...updates,
    }

    // Stringify the updated frontmatter
    const newFrontMatter = stringify(updated)

    // Replace old frontmatter with new one, preserving any leading comments
    return prompt.replace(
      /((?:\/\*[\s\S]*?\*\/\s*)?---\n)[\s\S]*?\n---/,
      `$1${newFrontMatter}---`,
    )
  } catch (error) {
    // If parsing fails, create new frontmatter
    const newFrontMatter = stringify(updates)
    return `---\n${newFrontMatter}---\n\n${prompt.replace(/(?:\/\*[\s\S]*?\*\/\s*)?---\n[\s\S]*?\n---\n/, '')}`
  }
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
  prompt,
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
  const isDefaultProvider =
    selectedProvider === envClient.NEXT_PUBLIC_DEFAULT_PROJECT_ID
  const modelOptions = useModelsOptions({
    provider: selectedProvider
      ? providersByName[selectedProvider]?.provider
      : undefined,
    isDefaultProvider,
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
      const provider = providersByName[value]!
      if (!provider) return

      setProvider(provider.name)
      const firstModel = findFirstModelForProvider(provider.provider)
      setModel(firstModel)

      const updatedPrompt = updatePromptMetadata(prompt, {
        provider: provider.name,
        model: firstModel,
      })
      onChangePrompt(updatedPrompt)
    },
    [providersByName, prompt],
  )

  const onModelChange = useCallback(
    (value: string) => {
      if (!selectedProvider) return

      setModel(value)
      const updatedPrompt = updatePromptMetadata(prompt, {
        model: value,
      })
      onChangePrompt(updatedPrompt)
    },
    [selectedProvider, prompt],
  )
  const newProviderLink = (
    <Link
      href={ROUTES.settings.root}
      className='flex-noWrap inline-block text-accent-foreground'
    >
      Set up new provider{' '}
      <Icon name='arrowRight' color='accentForeground' className='inline' />
    </Link>
  )
  const tooltipContent =
    'We include the Latitude provider by default with 100 free runs to allow you to test the product.'
  const newProviderOutro = (
    <>We highly recommend switching to your own provider. {newProviderLink}</>
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
      <ProviderModelSelector
        providerOptions={providerOptions}
        selectedProvider={selectedProvider}
        onProviderChange={onSelectProvider}
        modelOptions={modelOptions}
        selectedModel={selectedModel}
        onModelChange={onModelChange}
        providerDisabled={
          disabledMetadataSelectors ||
          isLoading ||
          !providerOptions.length ||
          !metadata
        }
        modelDisabled={
          isLoading ||
          disabledMetadataSelectors ||
          !selectedProvider ||
          !metadata
        }
      />
      {isDefaultProvider && (
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
                {tooltipContent}
              </Tooltip>{' '}
              {newProviderOutro}
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
                {tooltipContent}
              </Tooltip>{' '}
              {newProviderOutro}
            </Text.H6>
          )}
        </div>
      )}
    </div>
  )
}

export function ProviderModelSelector({
  providerOptions,
  selectedProvider,
  onProviderChange,
  modelOptions,
  selectedModel,
  onModelChange,
  providerDisabled = false,
  modelDisabled = false,
}: {
  providerOptions: { label: string; value: string }[]
  selectedProvider: string | undefined
  onProviderChange: (value: string) => void
  modelOptions: { label: string; value: string }[]
  selectedModel: string | undefined | null
  onModelChange: (value: string) => void
  providerDisabled?: boolean
  modelDisabled?: boolean
}) {
  return (
    <FormFieldGroup>
      <Select
        name='provider'
        label='Provider'
        placeholder='Select a provider'
        options={providerOptions}
        value={selectedProvider}
        disabled={providerDisabled}
        onChange={onProviderChange}
      />
      <Select
        disabled={modelDisabled}
        name='model'
        label='Model'
        placeholder={
          selectedModel === undefined ? 'Custom model' : 'Select a model'
        }
        options={modelOptions}
        value={selectedModel ?? undefined}
        onChange={onModelChange}
      />
    </FormFieldGroup>
  )
}
