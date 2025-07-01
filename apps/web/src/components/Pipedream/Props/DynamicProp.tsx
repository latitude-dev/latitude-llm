import { usePipedreamDynamicPropConfig } from '$/hooks/pipedreamProps/usePipedreamDynamicPropConfig'
import { IntegrationDto, PipedreamComponent } from '@latitude-data/core/browser'
import { Select } from '@latitude-data/web-ui/atoms/Select'
import { PaginatedSelect } from '@latitude-data/web-ui/molecules/PaginatedSelect'
import { cn } from '@latitude-data/web-ui/utils'
import { ConfigurableProp } from '@pipedream/sdk/browser'

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
}: {
  integration: IntegrationDto
  prop: ConfigurableProp
  component: PipedreamComponent
  configuredProps: Record<string, unknown>
  value: any
  setValue: (value: any) => void
}) {
  const { config, isLoading, errors, setQuery, nextPage } =
    usePipedreamDynamicPropConfig({
      integration,
      component,
      prop,
      configuredProps,
    })

  // TODO(triggers): Handle all dynamic props variations
  /*
    - string, no useQuery <-- although there is no useQuery, it could contain many options and can still benefit from local filtering and pagination
    - string[], no useQuery <-- add "multiple" prop to PaginatedSelect
    - string, useQuery <-- adjust PaginatedSelect to use query, as the current "fetch" prop expects returning the results, which is not the case here
    - string[], useQuery <-- add "multiple" prop to PaginatedSelect
  */

  return (
    <div className={cn({ 'animate-pulse': isLoading })}>
      <Select
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
        disabled={prop.disabled}
        placeholder='Select an option'
        errors={errors}
      />
    </div>
  )
}
