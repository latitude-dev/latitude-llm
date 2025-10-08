import { useMemo } from 'react'
import { DocumentTriggerType } from '@latitude-data/constants'
import { usePipedreamApp } from '$/stores/pipedreamApp'
import useIntegrations from '$/stores/integrations'
import { PipedreamIntegrationConfiguration } from '@latitude-data/core/services/integrations/helpers/schema'
import { DocumentTrigger } from '@latitude-data/core/schema/types'
import {
  type PipedreamComponent,
  type PipedreamComponentType,
} from '@latitude-data/core/constants'

type Trigger = PipedreamComponent<PipedreamComponentType.Trigger>
const EMPTY_LIST: Trigger[] = []

export function useIntegrationData({
  trigger,
}: {
  trigger: DocumentTrigger<DocumentTriggerType.Integration>
}) {
  const { data: integrations, isLoading: isLoadingIntegration } =
    useIntegrations({ withTriggers: true })

  const integration = useMemo(
    () =>
      integrations.find(
        (integration) => integration.id === trigger.configuration.integrationId,
      ),
    [integrations, trigger.configuration.integrationId],
  )

  const pipedreamSlug = useMemo(() => {
    if (!integration) return undefined
    const { appName } =
      integration.configuration as PipedreamIntegrationConfiguration
    return appName
  }, [integration])

  const { data: pipedreamApp, isLoading: isLoadingPipedramApp } =
    usePipedreamApp(pipedreamSlug)

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

    if (!pipedreamSlug) {
      return {
        isLoading: false as const,
        valid: false as const,
        error: 'App is not correctly configured in integration',
      }
    }

    if (!pipedreamApp) {
      return {
        isLoading: false as const,
        valid: false as const,
        error: `App '${pipedreamSlug}' does not exist`,
      }
    }

    const pipedreamTriggers = pipedreamApp.triggers ?? EMPTY_LIST
    const pipedreamTrigger = pipedreamTriggers.find(
      (pt) => pt.key === pipedreamTriggerKey,
    )

    if (!pipedreamTrigger) {
      return {
        isLoading: false as const,
        valid: false as const,
        error: `Trigger with id '${pipedreamTriggerKey}' does not exist on integration '${integration.name}'`,
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
