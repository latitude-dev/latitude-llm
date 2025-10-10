import { useEffect, useState } from 'react'
import useIntegrations from '$/stores/integrations'
import { LatitudePromptConfig } from '@latitude-data/constants/latitudePromptSchema'
import { useActiveIntegrationsStore } from './useActiveIntegrationsStore'
import { useEvents } from '$/lib/events'

export function useToolsData() {
  const [promptConfig, setPromptConfig] = useState<LatitudePromptConfig>(
    {} as LatitudePromptConfig,
  )
  const { buildIntegrations, setInitialized, initialized } =
    useActiveIntegrationsStore((state) => ({
      initialized: state.initialized,
      setInitialized: state.setInitialized,
      buildIntegrations: state.buildIntegrations,
    }))
  const { data, isLoading } = useIntegrations({
    includeLatitudeTools: true,
    withTools: true,
  })

  useEvents({
    onPromptMetadataChanged: ({ promptLoaded, metadata }) => {
      const isReady = promptLoaded && !isLoading
      if (!metadata) return
      if (!isReady) return

      setPromptConfig(metadata?.config as LatitudePromptConfig)
    },
  })

  useEffect(() => {
    if (isLoading) return
    if (!promptConfig) return

    buildIntegrations({ tools: promptConfig.tools, integrations: data })
    return () => {
      setInitialized(false)
    }
  }, [isLoading, promptConfig, data, buildIntegrations, setInitialized])

  return !initialized
}
