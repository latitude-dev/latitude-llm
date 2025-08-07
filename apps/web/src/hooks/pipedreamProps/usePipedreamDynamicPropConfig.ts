import { configurePipedreamComponentAction } from '$/actions/integrations/pipedream/configureComponent'
import type { IntegrationDto, PipedreamComponent } from '@latitude-data/core/browser'
import type {
  ConfigurableProp,
  ConfigurableProps,
  ConfigureComponentResponse,
  ConfiguredProps,
} from '@pipedream/sdk/browser'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useDebouncedCallback } from 'use-debounce'
import { useServerAction } from 'zsa-react'

type ConfigureComponentContext = Record<string, unknown>

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
  const [query, _setQuery] = useState<string | undefined>(undefined)
  const [page, setPage] = useState<number | undefined>(undefined)

  const setQuery = useCallback((newQuery: string | undefined) => {
    setPage(undefined) // Reset page when query changes
    _setQuery(newQuery)
  }, [])

  const nextPage = useCallback(() => {
    setPage((prevPage) => {
      if (prevPage === undefined) return 1
      return prevPage + 1
    })
  }, [])

  const prevPage = useCallback(() => {
    setPage((prevPage) => {
      if (prevPage === undefined || prevPage <= 1) return undefined
      return prevPage - 1
    })
  }, [])

  const [context, setContext] = useState<ConfigureComponentContext | undefined>(undefined)

  const [config, setConfig] = useState<ConfigureComponentResponse | undefined>(undefined)
  const {
    execute,
    isPending: isLoading,
    error: executeError,
  } = useServerAction(configurePipedreamComponentAction, {
    onSuccess: ({ data }) => {
      setConfig(data)
      setContext(data.context)
    },
  })

  const debouncedExecute = useDebouncedCallback(execute, 500, {
    leading: false,
    trailing: true,
  })

  // biome-ignore lint/correctness/useExhaustiveDependencies: ignored using `--suppress`
  useEffect(() => {
    debouncedExecute({
      integrationName: integration.name,
      componentId: component.key,
      propName: prop.name,
      configuredProps,
      previousContext: context,
      query,
      page,
    })
  }, [
    integration.name,
    component.key,
    prop.name,
    prop.remoteOptions,
    configuredProps,
    debouncedExecute,
    // context, // TODO(triggers): Fix this, it causes infinite loop
    query,
    page,
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
    query,
    page,
    setQuery,
    nextPage,
    prevPage,
  }
}
