import { configurePipedreamComponentAction } from '$/actions/integrations/pipedream/configureComponent'
import { IntegrationDto, PipedreamComponent } from '@latitude-data/core/browser'
import {
  ConfigurableProp,
  ConfigurableProps,
  ConfigureComponentResponse,
  ConfiguredProps,
} from '@pipedream/sdk/browser'
import { useEffect, useMemo, useState } from 'react'
import { useDebouncedCallback } from 'use-debounce'
import { useServerAction } from 'zsa-react'

export function usePipedreamDynamicPropConfig({
  integration,
  component,
  prop,
  configuredProps,
}: {
  integration: IntegrationDto
  component: PipedreamComponent
  prop: ConfigurableProp
  configuredProps: ConfiguredProps<ConfigurableProps>
}) {
  const [config, setConfig] = useState<ConfigureComponentResponse | undefined>(
    undefined,
  )
  const {
    execute,
    isPending: isLoading,
    error: executeError,
  } = useServerAction(configurePipedreamComponentAction, {
    onSuccess: ({ data }) => {
      setConfig(data)
    },
  })

  const debouncedExecute = useDebouncedCallback(execute, 500, {
    leading: false,
    trailing: true,
  })

  useEffect(() => {
    debouncedExecute({
      integrationName: integration.name,
      componentId: component.key,
      propName: prop.name,
      configuredProps,
    })
  }, [
    integration.name,
    component.key,
    prop.name,
    prop.remoteOptions,
    configuredProps,
    debouncedExecute,
  ])

  const errors = useMemo<[string, ...string[]] | undefined>(() => {
    if (executeError) return [executeError.message]
    if (!config?.errors?.length) return undefined

    return (config?.errors ?? []).map((errorString) => {
      try {
        return JSON.parse(errorString).message as string
      } catch {
        return errorString
      }
    }) as [string, ...string[]]
  }, [executeError, config?.errors])

  return {
    config,
    isLoading,
    errors,
  }
}
