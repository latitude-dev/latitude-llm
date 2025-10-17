import { reloadPipedreamComponentPropsAction } from '$/actions/integrations/pipedream/reloadComponentProps'
import useLatitudeAction from '$/hooks/useLatitudeAction'
import type {
  ConfigurableProp,
  ConfigurableProps,
  ConfiguredProps,
} from '@pipedream/sdk/browser'
import { useCallback, useState } from 'react'
import { useDebouncedCallback } from 'use-debounce'
import { IntegrationDto } from '@latitude-data/core/schema/models/types/Integration'
import { PipedreamComponent } from '@latitude-data/core/constants'
import { ConfigurablePropTimer } from '@pipedream/sdk'

const IGNORED_PROP_TYPES: ConfigurableProp['type'][] = [
  'app',
  '$.service.db',
  '$.interface.apphook',
  '$.interface.http',
]

const isTimer = (prop: ConfigurableProp): prop is ConfigurablePropTimer => {
  return prop.type === '$.interface.timer'
}

function propFilter(prop: ConfigurableProp): boolean {
  if (IGNORED_PROP_TYPES.includes(prop.type)) return false // some props are configured in the backend, or not configured at all

  if (isTimer(prop)) {
    if (prop.optional || prop.default) return false // if a timer prop is optional or has a default value, it is best to leave it unconfigured
  }
  return true
}

export function usePipedreamComponentProps({
  integration,
  component,
  defaultValues = {},
  onChange,
}: {
  integration: IntegrationDto
  component: PipedreamComponent
  defaultValues?: ConfiguredProps<ConfigurableProps>
  onChange?: (values: ConfiguredProps<ConfigurableProps>) => void
}) {
  const [props, setProps] = useState<ConfigurableProps>(
    component.configurableProps.filter(propFilter),
  )

  const { execute, isPending } = useLatitudeAction(
    reloadPipedreamComponentPropsAction,
    {
      onSuccess: ({ data }) => {
        setProps(data.dynamicProps?.configurableProps?.filter(propFilter) ?? [])
      },
    },
  )
  const debouncedExecute = useDebouncedCallback(execute, 500, {
    leading: false,
    trailing: true,
  })

  const [values, setValues] = useState<ConfiguredProps<ConfigurableProps>>(
    () => {
      // If initial values are provided, check if some defined props have the reloadProps attribute and run an initial reload
      const reloadProps = props.filter((p) => p.reloadProps)
      if (
        Object.keys(defaultValues).some((key) =>
          reloadProps.some((p) => p.name === key),
        )
      ) {
        debouncedExecute({
          integrationName: integration.name,
          componentId: component.key,
          configuredProps: defaultValues,
        })
      }

      return defaultValues
    },
  )

  const setValue = useCallback(
    (propName: string, value: any) => {
      let newValues: ConfiguredProps<ConfigurableProps> = {}

      setValues((prev) => {
        newValues = {
          ...prev,
          [propName]: value,
        }
        return newValues
      })

      onChange?.(newValues)

      const prop = props.find((p) => p.name === propName)
      if (!prop) return

      if (prop.reloadProps) {
        debouncedExecute({
          integrationName: integration.name,
          componentId: component.key,
          configuredProps: newValues,
        })
      }
    },
    [debouncedExecute, component.key, props, integration, onChange],
  )

  return {
    props,
    values,
    setValue,
    isLoading: isPending,
  }
}
