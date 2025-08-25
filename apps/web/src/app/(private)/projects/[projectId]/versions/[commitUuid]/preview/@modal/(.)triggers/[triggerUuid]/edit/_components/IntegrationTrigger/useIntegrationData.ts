import { useMemo } from 'react'
import type { DocumentTrigger } from '@latitude-data/core/browser'
import type { DocumentTriggerType } from '@latitude-data/constants'
import type { PipedreamComponent, PipedreamComponentType } from '@latitude-data/core/browser'
import { usePipedreamApp } from '$/stores/pipedreamApp'
import useIntegrations from '$/stores/integrations'

type Trigger = PipedreamComponent<PipedreamComponentType.Trigger>
const EMPTY_LIST: Trigger[] = []

export function useIntegrationData({
  trigger,
}: {
  trigger: DocumentTrigger<DocumentTriggerType.Integration>
}) {
  const { data: integrations, isLoading: isLoadingIntegration } = useIntegrations({
    withTriggers: true,
  })

  const integration = useMemo(
    () =>
      integrations.find((integration) => integration.id === trigger.configuration.integrationId),
    [integrations, trigger.configuration.integrationId],
  )

  let pipedreamSlug: string | undefined
  const integrationConfig = integration?.configuration
  if (integrationConfig && 'appName' in integrationConfig) {
    pipedreamSlug = integrationConfig.appName
  }
  const { data: pipedreamApp, isLoading: isLoadingPipedramApp } = usePipedreamApp(pipedreamSlug)

  const isLoading = isLoadingIntegration || isLoadingPipedramApp
  const pipedreamTriggerKey = trigger.configuration.componentId

  return useMemo(() => {
    if (isLoading) {
      return { isLoading: true as const }
    }

    if (!integration) {
      return {
        isLoading: false as const,
        valid: false as const,
        error: 'Integration not found',
      }
    }

    if (!pipedreamApp) {
      return {
        isLoading: false as const,
        valid: false as const,
        error: 'Integration not found',
      }
    }

    const pipedreamTriggers = pipedreamApp.triggers ?? EMPTY_LIST
    const pipedreamTrigger = pipedreamTriggers.find((pt) => pt.key === pipedreamTriggerKey)

    if (!pipedreamSlug || !pipedreamTrigger) {
      return {
        isLoading: false as const,
        valid: false as const,
        error: 'Integration not found',
      }
    }

    return {
      isLoading: false as const,
      valid: true as const,
      data: {
        integration,
        pipedreamSlug,
        pipedreamApp,
        pipedreamTrigger,
      },
    }
  }, [pipedreamSlug, integration, pipedreamApp, isLoading, pipedreamTriggerKey])
}
