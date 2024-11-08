import { ReactNode, useCallback, useEffect, useMemo, useState } from 'react'

import { ConversationMetadata } from '@latitude-data/compiler'
import {
  findFirstModelForProvider,
  ProviderApiKey,
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
import useModelOptions from '$/hooks/useModelOptions'
import { ROUTES } from '$/services/routes'
import useProviderApiKeys from '$/stores/providerApiKeys'
import Link from 'next/link'
import { parse, stringify } from 'yaml'

type PromptMetadata = { provider?: string; model?: string }
export type IProviderByName = Record<string, ProviderApiKey>

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

  const [provider, setProvider] = useState<string | undefined>()
  const [model, setModel] = useState<string | undefined | null>()

  const promptMetadata = useMemo<PromptMetadata | undefined>(() => {
    if (!metadata?.config) return undefined
    return {
      provider: metadata.config.provider as PromptMetadata['provider'],
      model: metadata.config.model as PromptMetadata['model'],
    }
  }, [metadata?.config])

  const providersByName = useMemo(() => {
    return providerApiKeys.reduce((acc, data) => {
      acc[data.name] = data
      return acc
    }, {} as IProviderByName)
  }, [isLoading, providerApiKeys])

  const providerOptions = useMemo(() => {
    return providerApiKeys.map((apiKey) => ({
      label: apiKey.name,
      value: apiKey.name,
    }))
  }, [providerApiKeys])
  const modelOptions = useModelOptions({
    provider: provider ? providersByName[provider]?.provider : undefined,
    name: provider ? providersByName[provider]?.name : undefined,
  })

  // onPromptMetadataChange
  useEffect(() => {
    if (!promptMetadata) return

    if (promptMetadata.provider !== provider) {
      setProvider(promptMetadata.provider)
    }

    if (!promptMetadata.model || promptMetadata.model !== model) {
      setModel(promptMetadata.model ?? null)
    }
  }, [promptMetadata])

  const onSelectProvider = useCallback(
    (selectedProvider: string) => {
      if (!selectedProvider) return
      if (selectedProvider === provider) return

      let firstModel
      if (providersByName[selectedProvider]) {
        firstModel = findFirstModelForProvider({
          provider: providersByName[selectedProvider],
          latitudeProvider: envClient.NEXT_PUBLIC_DEFAULT_PROJECT_ID,
        })
      }

      setProvider(selectedProvider)
      setModel(firstModel)

      const updatedPrompt = updatePromptMetadata(prompt, {
        provider: selectedProvider,
        model: firstModel,
      })
      onChangePrompt(updatedPrompt)
    },
    [provider, providersByName, prompt],
  )

  const onSelectModel = useCallback(
    (selectedModel: string) => {
      if (!selectedModel) return
      if (selectedModel === model) return

      setModel(selectedModel)

      const updatedPrompt = updatePromptMetadata(prompt, {
        model: selectedModel,
      })
      onChangePrompt(updatedPrompt)
    },
    [model, prompt],
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

  const isLatitudeProvider =
    provider === envClient.NEXT_PUBLIC_DEFAULT_PROJECT_ID

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
        selectedProvider={provider}
        onProviderChange={onSelectProvider}
        modelOptions={modelOptions}
        selectedModel={model}
        onModelChange={onSelectModel}
        providerDisabled={
          disabledMetadataSelectors ||
          isLoading ||
          !providerOptions.length ||
          !metadata
        }
        modelDisabled={
          disabledMetadataSelectors ||
          isLoading ||
          !modelOptions.length ||
          !provider ||
          !metadata
        }
      />
      {isLatitudeProvider && (
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
  const isModelOption = useMemo(
    () => modelOptions.some((opt) => opt.value === selectedModel),
    [modelOptions, selectedModel],
  )

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
        name='model'
        label='Model'
        placeholder={
          isModelOption || selectedModel === null
            ? 'Select a model'
            : 'Custom model'
        }
        options={modelOptions}
        value={selectedModel ?? undefined}
        disabled={modelDisabled}
        onChange={onModelChange}
      />
    </FormFieldGroup>
  )
}
