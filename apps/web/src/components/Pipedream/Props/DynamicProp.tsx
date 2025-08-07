import { usePipedreamDynamicPropConfig } from '$/hooks/pipedreamProps/usePipedreamDynamicPropConfig'
import type { IntegrationDto, PipedreamComponent } from '@latitude-data/core/browser'
import { Select } from '@latitude-data/web-ui/atoms/Select'
import { MultiSelect } from '@latitude-data/web-ui/molecules/MultiSelect'
import { cn } from '@latitude-data/web-ui/utils'
import type { ConfigurableProp } from '@pipedream/sdk/browser'

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

  if (prop.type.endsWith('[]')) {
    return (
      <div className={cn({ 'animate-pulse': isLoading })}>
        <MultiSelect
          loading={!config}
          name={prop.name}
          required={!prop.optional}
          label={prop.label ?? prop.name}
          description={prop.description}
          defaultValue={value ?? []}
          onChange={(newVal) => setValue(newVal)}
          options={
            (config?.options ?? config?.stringOptions ?? []).map((option) => {
              if (typeof option === 'string') {
                return { label: option, value: option }
              }
              return option
            }) ?? []
          }
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
        options={
          (config?.options ?? config?.stringOptions ?? []).map((option) => {
            if (typeof option === 'string') {
              return { label: option, value: option }
            }
            return option
          }) ?? []
        }
        disabled={disabled || prop.disabled}
        placeholder='Select an option'
        errors={errors}
      />
    </div>
  )
}
