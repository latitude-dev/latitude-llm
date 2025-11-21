import { envClient } from '$/envClient'
import { getModelOptionsForProvider } from '$/hooks/useModelOptions'
import { useNavigate } from '$/hooks/useNavigate'
import { useEvents } from '$/lib/events'
import {
  ICON_BY_LLM_PROVIDER,
  LABEL_BY_LLM_PROVIDER,
} from '$/lib/providerIcons'
import { ROUTES } from '$/services/routes'
import useCurrentWorkspace from '$/stores/currentWorkspace'
import { SerializedProviderApiKey } from '$/stores/providerApiKeys'
import { Badge } from '@latitude-data/web-ui/atoms/Badge'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Icon, IconName } from '@latitude-data/web-ui/atoms/Icons'
import {
  Popover,
  type PopoverContentProps,
} from '@latitude-data/web-ui/atoms/Popover'
import {
  TwoColumnSelect,
  TwoColumnSelectOption,
} from '@latitude-data/web-ui/molecules/TwoColumnSelect'
import { useCallback, useMemo, useState } from 'react'
import { ModelOption, ModelSelector } from './ModelSelector'
import { sortProviders } from './sortProviders'
import { Providers } from '@latitude-data/constants'
import { findFirstModelForProvider } from '@latitude-data/core/services/ai/providers/models/index'

import { ProviderApiKey } from '@latitude-data/core/schema/models/types/ProviderApiKey'
import { updatePromptMetadata as updatePromptMetadataFunction } from '@latitude-data/core/lib/updatePromptMetadata'
function getProviderIcon({
  provider,
  model,
  isLoading = false,
  checkModel = false,
}: {
  provider?: SerializedProviderApiKey | null
  model?: string | null
  checkModel?: boolean
  isLoading?: boolean
}): { name: IconName; spin?: boolean } {
  if (isLoading) return { name: 'loader', spin: true }
  if (!provider) return { name: 'alert' }
  if (checkModel && !model) return { name: 'alert' }

  if (provider.name === envClient.NEXT_PUBLIC_DEFAULT_PROVIDER_NAME) {
    return { name: 'logoMonochrome' }
  }

  return { name: ICON_BY_LLM_PROVIDER[provider.provider] }
}

function getProviderLabel(provider: SerializedProviderApiKey) {
  if (provider.name === envClient.NEXT_PUBLIC_DEFAULT_PROVIDER_NAME) {
    return 'Limited runs'
  }

  return LABEL_BY_LLM_PROVIDER[provider.provider]
}

function buildModelOptions({
  provider,
  model,
}: {
  provider?: ProviderApiKey
  model?: string | null
}) {
  const providerModelOptions = getModelOptionsForProvider({
    provider: provider?.provider,
    name: provider?.name,
  })
  const existing = providerModelOptions.find((m) => m.value === model)
  if (existing || !model) return providerModelOptions

  return [{ value: model, label: model, custom: true }, ...providerModelOptions]
}

export function ProviderModelSelector({
  prompt,
  onChangePrompt,
  providers = [],
  disabledMetadataSelectors = false,
  alignPopover = 'start',
  fancyButton = false,
  updatePromptMetadata,
  setProvider: setProviderCallback,
  setModel: setModelCallback,
  defaultProvider,
  defaultModel,
}: {
  prompt: string
  onChangePrompt: (prompt: string) => void
  providers?: ProviderApiKey[]
  disabledMetadataSelectors?: boolean
  alignPopover?: PopoverContentProps['align']
  fancyButton?: boolean
  updatePromptMetadata?: typeof updatePromptMetadataFunction
  setProvider?: (provider: ProviderApiKey | undefined) => void
  setModel?: (model: string | undefined | null) => void
  defaultProvider?: ProviderApiKey
  defaultModel?: string | null
}) {
  const [isInitialized, setInitialized] = useState(
    !updatePromptMetadata ? true : false,
  )
  const { data: workspace } = useCurrentWorkspace()
  const [open, setOpen] = useState(false)
  const [provider, setProvider] = useState<ProviderApiKey | undefined>(
    defaultProvider,
  )
  const [modelOptions, setModelOptions] = useState<ModelOption[]>([])
  const [model, setModel] = useState<string | undefined | null>(defaultModel)
  const defaultProviderId = workspace?.defaultProviderId
  const providerOptions = useMemo<TwoColumnSelectOption<number>[]>(
    () =>
      providers.sort(sortProviders(defaultProviderId)).map((p) => ({
        label: getProviderLabel(p),
        icon: getProviderIcon({ provider: p }).name,
        value: p.id,
        name: defaultProviderId !== p.id ? p.name : `${p.name} (default)`,
      })),
    [providers, defaultProviderId],
  )
  const onProviderChange = useCallback(
    (providerId: number) => {
      if (!providerId) return
      if (providerId === provider?.id) return

      const selectedProvider = providers.find((p) => p.id === providerId)
      if (!selectedProvider) return

      const firstModel = findFirstModelForProvider({
        provider: selectedProvider,
        defaultProviderName: envClient.NEXT_PUBLIC_DEFAULT_PROVIDER_NAME,
      })

      setModelOptions(buildModelOptions({ provider: selectedProvider }))
      setProvider(selectedProvider)
      setModel(firstModel)

      const updatedPrompt = updatePromptMetadata?.(prompt, {
        provider: selectedProvider.name,
        model: firstModel,
      })
      setProviderCallback?.(selectedProvider)
      setModelCallback?.(firstModel)
      onChangePrompt(updatedPrompt ?? prompt)
    },
    [
      providers,
      provider,
      prompt,
      onChangePrompt,
      updatePromptMetadata,
      setProviderCallback,
      setModelCallback,
    ],
  )
  const navigate = useNavigate()
  const onAddNewProvider = useCallback(() => {
    navigate.push(ROUTES.settings.providerApiKeys.new.root)
  }, [navigate])
  const addNewProvider = useMemo(
    () => ({
      addNewLabel: 'Add new provider',
      onAddNew: onAddNewProvider,
    }),
    [onAddNewProvider],
  )

  const isReady = isInitialized
  const isLoading = !isInitialized
  const isDisabled = disabledMetadataSelectors || !isInitialized
  const providerDisabled = isDisabled || !providerOptions.length
  const onModelChange = useCallback(
    (selectedModel: string | null) => {
      setModel(selectedModel)

      // For custom providers, we don't need to rebuild options since
      // the ModelSelector handles custom options internally
      if (provider?.provider !== Providers.Custom) {
        setModelOptions(
          buildModelOptions({
            provider,
            model: selectedModel,
          }),
        )
      }

      const updatedPrompt = updatePromptMetadata?.(
        prompt,
        {
          provider: provider?.name || '',
          model: selectedModel,
        },
        { keysToBeRemovedWhenNull: ['model'] },
      )
      setProviderCallback?.(provider)
      setModelCallback?.(selectedModel)
      setOpen(false)
      onChangePrompt(updatedPrompt ?? prompt)
    },
    [
      prompt,
      provider,
      onChangePrompt,
      setProviderCallback,
      setModelCallback,
      updatePromptMetadata,
    ],
  )
  const modelDisabled = useMemo(() => {
    if (isDisabled || !provider) return true

    // For custom providers, they're never disabled due to empty options
    // since they can create custom models on the fly
    if (provider.provider === Providers.Custom) return false

    // For non-custom providers, disable if no options available
    return !modelOptions.length
  }, [isDisabled, provider, modelOptions.length])

  useEvents({
    onPromptMetadataChanged: ({ promptLoaded, metadata }) => {
      if (!updatePromptMetadata) return
      if (!promptLoaded) return
      if (!isInitialized && !!metadata) setInitialized(true)

      const { provider: providerName, model: m } = metadata.config || {}
      const selectedProvider = providers.find((p) => p.name === providerName)

      setProvider(selectedProvider)

      if (typeof m === 'string') {
        setModel(m)
      } else {
        setModel(null)
      }

      setModelOptions(
        buildModelOptions({
          provider: selectedProvider,
          model: m as string,
        }),
      )
    },
  })
  const providerLabel = useMemo(() => {
    if (!isReady) return 'Loading...'
    if (!provider?.name) return 'Select Provider'
    if (!model) return 'Select Model'

    return provider.name
  }, [provider?.name, model, isReady])

  const { name: iconName, spin } = getProviderIcon({
    provider,
    model,
    checkModel: true,
    isLoading,
  })

  const onModelSearchChange = useCallback(
    (search: string) => {
      // For custom providers, we don't need to rebuild options on every search
      // The ModelSelector will handle adding custom options internally
      if (provider?.provider === Providers.Custom) return

      // For non-custom providers, only add the search term if it's not empty
      // and doesn't already exist in the provider options
      if (!search.trim()) return

      const currentOptions = getModelOptionsForProvider({
        provider: provider?.provider,
        name: provider?.name,
      })

      const existing = currentOptions.find((m) => m.value === search)
      if (existing) return

      // Only rebuild if we're adding a new custom option
      setModelOptions(buildModelOptions({ provider, model: search }))
    },
    [provider],
  )

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <Button
          variant='outline'
          fancy={fancyButton}
          ellipsis
          disabled={isDisabled}
          onClick={() => setOpen(true)}
          iconProps={{
            name: 'chevronsUpDown',
            color: 'foregroundMuted',
            placement: 'right',
          }}
        >
          <div className='flex flex-row items-center gap-x-2 max-w-64'>
            <Icon
              name={iconName}
              spin={spin}
              color='foregroundMuted'
              className='flex-none'
            />
            <span className='flex-1 whitespace-nowrap'>{providerLabel}</span>
            {model ? (
              <Badge ellipsis noWrap variant='accent'>
                {model}
              </Badge>
            ) : null}
          </div>
        </Button>
      </Popover.Trigger>
      <Popover.Content
        align={alignPopover}
        maxHeight='normal'
        style={{ width: 600, maxWidth: 600, padding: 0 }}
      >
        <TwoColumnSelect
          loading={!isReady}
          options={providerOptions}
          emptySlateLabel='No providers available. Add one'
          addNew={addNewProvider}
          disabled={providerDisabled}
          onChange={onProviderChange}
          value={provider?.id}
        >
          {provider ? (
            <ModelSelector
              key={provider.id}
              isCustom={provider.provider === Providers.Custom}
              options={modelOptions}
              onChange={onModelChange}
              onSearchChange={onModelSearchChange}
              value={model}
              disabled={modelDisabled}
            />
          ) : null}
        </TwoColumnSelect>
      </Popover.Content>
    </Popover.Root>
  )
}
