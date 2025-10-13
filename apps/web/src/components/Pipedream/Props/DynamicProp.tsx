import { usePipedreamDynamicPropConfig } from '$/hooks/pipedreamProps/usePipedreamDynamicPropConfig'
import { Select } from '@latitude-data/web-ui/atoms/Select'
import { cn } from '@latitude-data/web-ui/utils'
import type { ConfigurableProp } from '@pipedream/sdk/browser'
import { useMemo } from 'react'
import { IntegrationDto } from '@latitude-data/core/schema/types'
import { PipedreamComponent } from '@latitude-data/core/constants'
import { MultiSelectInput } from '@latitude-data/web-ui/molecules/MultiSelectInput'

export function isDynamicProp(prop: ConfigurableProp): boolean {
  if (prop.remoteOptions) return true

  // Two weird exceptions for some reason
  if (prop.type.startsWith('$.discord.')) return true
  if (prop.type.startsWith('$.airtable.')) return true

  return false
}

export default function DynamicPipedreamProp({
  integration,
  prop,
  component,
  configuredProps,
  value,
  setValue,
  disabled,
}: {
  integration: IntegrationDto
  prop: ConfigurableProp
  component: PipedreamComponent
  configuredProps: Record<string, unknown>
  value: any
  setValue: (value: any) => void
  disabled?: boolean
}) {
  const { config, isLoading, errors } = usePipedreamDynamicPropConfig({
    integration,
    component,
    prop,
    configuredProps,
  })

  const options = useMemo<{ label: string; value: string }[]>(() => {
    if (config?.options) {
      return config.options.map((option) => {
        const { label, value } = 'lv' in option ? option.lv : option
        return { label, value: (value as string) ?? label }
      })
    }

    if (config?.stringOptions) {
      return config.stringOptions.map((option) => ({
        label: option,
        value: option,
      }))
    }

    return []
  }, [config])

  if (prop.type.endsWith('[]')) {
    return (
      <div className={cn({ 'animate-pulse': isLoading })}>
        <MultiSelectInput
          loading={!config}
          name={prop.name}
          required={!prop.optional}
          label={prop.label ?? prop.name}
          description={prop.description}
          defaultValue={value ?? []}
          onChange={(newVal) => setValue(newVal)}
          options={options}
          disabled={disabled || prop.disabled}
          placeholder='Select an option'
          errors={errors}
        />
      </div>
    )
  }

  return (
    <div className={cn({ 'animate-pulse': isLoading })}>
      <Select
        searchable
        loading={!config}
        name={prop.name}
        required={!prop.optional}
        label={prop.label ?? prop.name}
        description={prop.description}
        value={value}
        onChange={(newVal) => setValue(newVal)}
        options={options}
        disabled={disabled || prop.disabled}
        placeholder='Select an option'
        errors={errors}
      />
    </div>
  )
}
