import { reloadPipedreamComponentPropsAction } from '$/actions/integrations/pipedream/reloadComponentProps'
import useLatitudeAction from '$/hooks/useLatitudeAction'
import type {
  ConfigurableProp,
  ConfigurableProps,
  ConfiguredProps,
} from '@pipedream/sdk/browser'
import { useCallback, useState } from 'react'
import { useDebouncedCallback } from 'use-debounce'
import { IntegrationDto } from '@latitude-data/core/schema/types'
import { PipedreamComponent } from '@latitude-data/core/constants'

const IGNORED_PROP_TYPES: ConfigurableProp['type'][] = [
  'app',
  '$.service.db',
  '$.interface.apphook',
  '$.interface.http',
]

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
    // some props are configured in the backend, or not configured at all
    component.configurableProps.filter(
      (p) => !IGNORED_PROP_TYPES.includes(p.type),
    ),
  )

  const { execute, isPending } = useLatitudeAction(
    reloadPipedreamComponentPropsAction,
    {
      onSuccess: ({ data }) => {
        setProps(
          // some props are configured in the backend, or not configured at all
          data.dynamicProps?.configurableProps?.filter(
            (p) => !IGNORED_PROP_TYPES.includes(p.type),
          ) ?? [],
        )
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
