import { useCallback, useMemo, useState } from 'react'
import {
  findFirstModelForProvider,
  ProviderApiKey,
  Providers,
} from '@latitude-data/core/browser'
import {
  Popover,
  type PopoverContentProps,
} from '@latitude-data/web-ui/atoms/Popover'
import { envClient } from '$/envClient'
import { SerializedProviderApiKey } from '$/stores/providerApiKeys'
import { Badge } from '@latitude-data/web-ui/atoms/Badge'
import { updatePromptMetadata } from '$/lib/promptMetadata'
import { getModelOptionsForProvider } from '$/hooks/useModelOptions'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import {
  TwoColumnSelect,
  TwoColumnSelectOption,
} from '@latitude-data/web-ui/molecules/TwoColumnSelect'
import { Icon, IconName } from '@latitude-data/web-ui/atoms/Icons'
import { useNavigate } from '$/hooks/useNavigate'
import { ROUTES } from '$/services/routes'
import {
  ICON_BY_LLM_PROVIDER,
  LABEL_BY_LLM_PROVIDER,
} from '$/lib/providerIcons'
import useCurrentWorkspace from '$/stores/currentWorkspace'
import { ModelOption, ModelSelector } from './ModelSelector'
import { useEvents } from '$/lib/events'
import { sortProviders } from './sortProviders'

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
  const exiting = providerModelOptions.find((m) => m.value === model)
  if (exiting || !model) return providerModelOptions

  return [{ value: model, label: model, custom: true }, ...providerModelOptions]
}

export function ProviderModelSelector({
  prompt,
  onChangePrompt,
  providers = [],
  disabledMetadataSelectors = false,
  alignPopover = 'start',
  fancyButton = false,
}: {
  prompt: string
  onChangePrompt: (prompt: string) => void
  providers?: ProviderApiKey[]
  disabledMetadataSelectors?: boolean
  alignPopover?: PopoverContentProps['align']
  fancyButton?: boolean
}) {
  const [isInitialized, setInitialized] = useState(false)
  const { data: workspace } = useCurrentWorkspace()
  const [open, setOpen] = useState(false)
  const [provider, setProvider] = useState<ProviderApiKey | undefined>()
  const [modelOptions, setModelOptions] = useState<ModelOption[]>([])
  const [model, setModel] = useState<string | undefined | null>()
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

      const updatedPrompt = updatePromptMetadata(prompt, {
        provider: selectedProvider.name,
        model: firstModel,
      })
      onChangePrompt(updatedPrompt)
    },
    [providers, provider, prompt, onChangePrompt],
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
      setModelOptions(
        buildModelOptions({
          provider,
          model: selectedModel,
        }),
      )
      setModel(selectedModel)

      const updatedPrompt = updatePromptMetadata(
        prompt,
        {
          provider: provider?.name || '',
          model: selectedModel,
        },
        { keysToBeRemovedWhenNull: ['model'] },
      )
      setOpen(false)
      onChangePrompt(updatedPrompt)
    },
    [prompt, provider, onChangePrompt, setModelOptions],
  )
  const modelDisabled = isDisabled || !provider || !modelOptions.length

  useEvents({
    onPromptMetadataChanged: ({ promptLoaded, config }) => {
      if (!promptLoaded) return
      if (!isInitialized && !!config) {
        setInitialized(true)
      }

      const { provider: providerName, model: m } = config || {}
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
          model: m,
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
      setModelOptions(buildModelOptions({ provider, model: search }))
    },
    [setModelOptions, provider],
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
