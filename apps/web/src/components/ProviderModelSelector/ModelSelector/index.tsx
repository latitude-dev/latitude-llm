import {
  Command,
  CommandInput,
  CommandItem,
  CommandList,
} from '@latitude-data/web-ui/atoms/Command'
import { Icon, IconName } from '@latitude-data/web-ui/atoms/Icons'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { Tooltip } from '@latitude-data/web-ui/atoms/Tooltip'
import { cn } from '@latitude-data/web-ui/utils'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  type ModelOption as ModelOptionType,
  type ModelModality,
} from '$/hooks/useModelOptions'

export type ModelOption = ModelOptionType

function formatContextLimit(limit?: number): string {
  if (!limit) return ''
  if (limit >= 1_000_000) return `${(limit / 1000000).toFixed(1)}M`
  if (limit >= 1_000) return `${Math.round(limit / 1000)}K`
  return String(limit)
}

function formatPrice(price?: number): string {
  if (price === undefined || price === null) return ''
  if (price === 0) return '$0'
  if (price < 0.01) return `$${price.toFixed(3)}`
  if (price < 1) return `$${price.toFixed(2)}`
  return `$${price.toFixed(2)}`
}

function ModelFeatureBadges({ option }: { option: ModelOption }) {
  if (!option.reasoning && !option.toolCall && !option.structuredOutput) {
    return null
  }

  return (
    <div className='flex items-center gap-1 flex-shrink-0'>
      {option.reasoning && (
        <Tooltip trigger={<Icon name='brain' color='foregroundMuted' />}>
          Reasoning
        </Tooltip>
      )}
      {option.toolCall && (
        <Tooltip trigger={<Icon name='wrench' color='foregroundMuted' />}>
          Tool calling
        </Tooltip>
      )}
      {option.structuredOutput && (
        <Tooltip trigger={<Icon name='braces' color='foregroundMuted' />}>
          Structured output
        </Tooltip>
      )}
    </div>
  )
}

const MODALITY_ICON_MAP: Record<ModelModality, IconName> = {
  text: 'text',
  image: 'image',
  audio: 'headset',
  video: 'video',
  pdf: 'file',
}

function ModelModalitiesRow({
  label,
  modalities,
  cost,
}: {
  label: string
  modalities?: ModelModality[]
  cost?: number
}) {
  if (!modalities?.length) return null

  return (
    <div className='flex items-center justify-between gap-2'>
      <div className='flex items-center gap-2'>
        <Text.H6M color='foregroundMuted' noWrap ellipsis>
          {label}
        </Text.H6M>
        {cost !== undefined && (
          <Tooltip
            trigger={
              <Text.H6 color='foregroundMuted'>{formatPrice(cost)}</Text.H6>
            }
          >
            {formatPrice(cost)} per 1M tokens
          </Tooltip>
        )}
      </div>
      <div className='flex items-center gap-1'>
        {modalities
          .filter((modality) => modality in MODALITY_ICON_MAP)
          .map((modality) => (
            <Tooltip
              key={modality}
              trigger={
                <Icon
                  name={MODALITY_ICON_MAP[modality]}
                  color='foregroundMuted'
                />
              }
            >
              {modality}
            </Tooltip>
          ))}
      </div>
    </div>
  )
}

function ModelContext({ option }: { option: ModelOption }) {
  if (!option.contextLimit && !option.knowledgeCutoff) return null

  return (
    <div className='flex items-center justify-between gap-2'>
      <div className='flex items-center gap-2'>
        <Text.H6M color='foregroundMuted'>Context</Text.H6M>
        {option.contextLimit && (
          <Tooltip
            trigger={
              <Text.H6 color='foregroundMuted'>
                {formatContextLimit(option.contextLimit)}
              </Text.H6>
            }
          >
            Max {option.contextLimit?.toLocaleString()} tokens
          </Tooltip>
        )}
      </div>
      {option.knowledgeCutoff && (
        <Tooltip
          trigger={
            <Text.H6 color='foregroundMuted'>{option.knowledgeCutoff}</Text.H6>
          }
        >
          Knowledge cutoff: {option.knowledgeCutoff}
        </Tooltip>
      )}
    </div>
  )
}

export function ModelSelector({
  options,
  onChange,
  onSearchChange,
  value: inputValue,
  disabled,
  isCustom = false,
}: {
  options: ModelOption[]
  onChange: (model: string | null) => void
  onSearchChange: (search: string) => void
  disabled: boolean
  isCustom: boolean
  value?: string | null
}) {
  const [searchQuery, setSearchQuery] = useState('')

  // Initialize search query based on custom provider and current value
  useEffect(() => {
    if (isCustom && inputValue) {
      setSearchQuery(inputValue)
    } else if (!isCustom) {
      setSearchQuery('')
    }
  }, [isCustom, inputValue])

  const onSelect = useCallback(
    (selectedValue: string) => () => {
      const isEmpty = isCustom && !selectedValue.trim()
      onChange(isEmpty ? null : selectedValue)
      if (!isCustom) {
        setSearchQuery('')
      }
    },
    [onChange, isCustom],
  )

  const onValueChange = useCallback(
    (newValue: string) => {
      setSearchQuery(newValue)
      onSearchChange(newValue)
    },
    [setSearchQuery, onSearchChange],
  )

  // Enhanced options that include current search as custom option when needed
  const enhancedOptions = useMemo(() => {
    const baseOptions: ModelOption[] = [...options]

    // For custom providers or when search doesn't match any existing option,
    // add the search term as a custom option
    if (searchQuery.trim() && isCustom) {
      const existingOption = baseOptions.find(
        (option) =>
          option.value === searchQuery || option.label === searchQuery,
      )
      if (!existingOption) {
        baseOptions.unshift({
          id: searchQuery,
          name: searchQuery,
          provider: 'custom',
          value: searchQuery,
          label: searchQuery,
          custom: true,
        })
      }
    }

    // Always ensure the current value is available as an option
    if (inputValue?.trim()) {
      const existingOption = baseOptions.find(
        (option) => option.value === inputValue,
      )
      if (!existingOption) {
        baseOptions.unshift({
          id: inputValue,
          name: inputValue,
          provider: 'custom',
          value: inputValue,
          label: inputValue,
          custom: true,
        })
      }
    }

    return baseOptions
  }, [options, searchQuery, isCustom, inputValue])

  // Filter and search - searches both label (id) and name
  const filtered = useMemo(
    () =>
      enhancedOptions.filter((option) => {
        const query = searchQuery.toLowerCase()
        const matchesLabel = option.label.toLowerCase().includes(query)
        const matchesName = option.name?.toLowerCase().includes(query)
        return matchesLabel || matchesName
      }),
    [enhancedOptions, searchQuery],
  )

  // For custom providers, individual items should not be disabled if they are custom options
  // For non-custom providers, use the passed disabled state
  const getItemDisabled = useCallback(
    (option: ModelOption) => {
      if (isCustom && option.custom) {
        return false // Custom options in custom providers are always enabled
      }
      return disabled
    },
    [isCustom, disabled],
  )

  return (
    <Command value={inputValue ?? ''} className='h-full'>
      <CommandInput
        autoFocus
        searchIcon={isCustom ? 'plus' : 'search'}
        placeholder={isCustom ? 'Use custom model...' : 'Search models...'}
        value={searchQuery}
        onValueChange={onValueChange}
      />
      <CommandList maxHeight='auto' className='p-1'>
        {filtered.map((option) => (
          <CommandItem
            disabled={getItemDisabled(option)}
            key={option.value}
            value={option.label}
            onSelect={onSelect(option.value)}
            className={cn(
              'flex flex-col gap-1 items-stretch',
              'w-full py-2',
              'cursor-pointer',
              {
                '!bg-accent': option.value === inputValue,
              },
            )}
          >
            {option.custom ? (
              <div className='flex items-center justify-between gap-2 min-w-0 flex-grow'>
                <Text.H6 noWrap ellipsis color='foreground' isItalic>
                  {option.label}
                </Text.H6>
                {option.value === searchQuery && (
                  <div className='flex items-center gap-1'>
                    <Text.H6 color='accentForeground'>use</Text.H6>
                    <Icon
                      name='arrowRight'
                      color='accentForeground'
                      className='flex-shrink-0'
                    />
                  </div>
                )}
              </div>
            ) : (
              <>
                <div className='flex items-center justify-between gap-2 min-w-0 flex-grow'>
                  <Tooltip
                    asChild
                    trigger={
                      <Text.H6B
                        noWrap
                        ellipsis
                        isItalic={option.custom}
                        color='foreground'
                      >
                        {option.name ?? option.label}
                      </Text.H6B>
                    }
                  >
                    {option.label}
                  </Tooltip>
                  <ModelFeatureBadges option={option} />
                </div>

                <ModelModalitiesRow
                  label='Input'
                  modalities={option.modalities?.input}
                  cost={option.pricing?.input}
                />
                <ModelModalitiesRow
                  label='Output'
                  modalities={option.modalities?.output}
                  cost={option.pricing?.output}
                />
                <ModelContext option={option} />
              </>
            )}
          </CommandItem>
        ))}
      </CommandList>
    </Command>
  )
}
