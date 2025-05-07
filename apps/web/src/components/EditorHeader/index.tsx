import {
  memo,
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react'

import { envClient } from '$/envClient'
import useModelOptions from '$/hooks/useModelOptions'
import { updatePromptMetadata } from '$/lib/promptMetadata'
import { ROUTES } from '$/services/routes'
import useProviderApiKeys from '$/stores/providerApiKeys'
import {
  findFirstModelForProvider,
  ProviderApiKey,
} from '@latitude-data/core/browser'
import type { ConversationMetadata } from 'promptl-ai'
import {
  AppLocalStorage,
  useLocalStorage,
} from '@latitude-data/web-ui/hooks/useLocalStorage'
import { DropdownMenu } from '@latitude-data/web-ui/atoms/DropdownMenu'
import { FormFieldGroup } from '@latitude-data/web-ui/atoms/FormFieldGroup'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { Select } from '@latitude-data/web-ui/atoms/Select'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { Tooltip } from '@latitude-data/web-ui/atoms/Tooltip'
import Link from 'next/link'
import { PromptConfiguration } from '$/app/(private)/projects/[projectId]/versions/[commitUuid]/documents/[documentUuid]/_components/DocumentEditor/Editor/PromptConfiguration'
import { PromptIntegrations } from '$/app/(private)/projects/[projectId]/versions/[commitUuid]/documents/[documentUuid]/_components/DocumentEditor/Editor/PromptIntegrations'

type PromptMetadata = { provider?: string; model?: string }
export type IProviderByName = Record<string, ProviderApiKey>

export const EditorHeader = memo(
  ({
    title,
    metadata,
    onChangePrompt,
    rightActions,
    leftActions,
    disabledMetadataSelectors = false,
    providers,
    freeRunsCount,
    showCopilotSetting,
    prompt,
    canUseSubagents = true,
  }: {
    title: string | ReactNode
    metadata: ConversationMetadata | undefined
    prompt: string
    onChangePrompt: (prompt: string) => void
    rightActions?: ReactNode
    leftActions?: ReactNode
    disabledMetadataSelectors?: boolean
    providers?: ProviderApiKey[]
    freeRunsCount?: number
    showCopilotSetting?: boolean
    canUseSubagents?: boolean
  }) => {
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
    const { value: autoClosingTags, setValue: setAutoClosingTags } =
      useLocalStorage({
        key: AppLocalStorage.editorAutoClosingTags,
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
    }, [providerApiKeys])

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
    }, [promptMetadata, model, provider])

    const onSelectProvider = useCallback(
      (selectedProvider: string) => {
        if (!selectedProvider) return
        if (selectedProvider === provider) return

        const firstModel = findFirstModelForProvider({
          provider: providersByName[selectedProvider],
          defaultProviderName: envClient.NEXT_PUBLIC_DEFAULT_PROVIDER_NAME,
        })

        setProvider(selectedProvider)
        setModel(firstModel)

        const updatedPrompt = updatePromptMetadata(prompt, {
          provider: selectedProvider,
          model: firstModel,
        })
        onChangePrompt(updatedPrompt)
      },
      [provider, providersByName, prompt, onChangePrompt],
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
      [model, prompt, onChangePrompt],
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
      provider === envClient.NEXT_PUBLIC_DEFAULT_PROVIDER_NAME

    return (
      <div className='flex flex-col gap-y-2'>
        <div className='flex flex-row h-8 justify-between items-center gap-x-4'>
          <div className='flex flex-row items-center gap-2 min-w-0'>
            {typeof title === 'string' ? <Text.H4M>{title}</Text.H4M> : title}
            {leftActions}
          </div>
          <div className='flex flex-row items-center gap-2'>
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
                {
                  label: 'Auto closing tags',
                  onClick: () => setAutoClosingTags(!autoClosingTags),
                  checked: autoClosingTags,
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
        <div className='flex flex-row items-end gap-2'>
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
          <PromptConfiguration
            disabled={disabledMetadataSelectors}
            canUseSubagents={canUseSubagents}
            config={metadata?.config ?? {}}
            setConfig={(config: Record<string, unknown>) => {
              onChangePrompt(updatePromptMetadata(prompt, config))
            }}
          />
          <PromptIntegrations
            disabled={disabledMetadataSelectors}
            config={metadata?.config ?? {}}
            setConfig={(config: Record<string, unknown>) => {
              onChangePrompt(updatePromptMetadata(prompt, config))
            }}
          />
        </div>
        {isLatitudeProvider && (
          <div>
            {freeRunsCount !== undefined ? (
              <Text.H6 color='foregroundMuted'>
                You have consumed{' '}
                <Tooltip
                  asChild
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
                  asChild
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
  },
)

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
        info='Select a model from the list. If you do not find the one you need, write manually a custom one in the prompt configuration.'
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
