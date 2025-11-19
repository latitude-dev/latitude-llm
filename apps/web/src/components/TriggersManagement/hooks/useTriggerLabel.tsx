import { useMemo } from 'react'
import { DocumentTrigger } from '@latitude-data/core/schema/models/types/DocumentTrigger'
import {
  IntegrationDto,
  PipedreamIntegration,
} from '@latitude-data/core/schema/models/types/Integration'
import { DocumentTriggerType } from '@latitude-data/constants'
import { IntegrationTriggerConfiguration } from '@latitude-data/constants/documentTriggers'
import { usePipedreamApp } from '$/stores/pipedreamApp'

type UseTriggerLabelParams = {
  trigger?: DocumentTrigger
  integrations: IntegrationDto[]
}

/**
 * Hook to get the display label for a trigger.
 * Returns the appropriate title based on trigger type:
 * - Scheduled: "Schedule"
 * - Email: "Email"
 * - Integration: Integration name or component name
 */
export function useTriggerLabel({
  trigger,
  integrations,
}: UseTriggerLabelParams): string {
  const integration = useMemo(() => {
    if (!trigger || trigger.triggerType !== DocumentTriggerType.Integration) {
      return undefined
    }

    const config = trigger.configuration as IntegrationTriggerConfiguration
    return integrations.find((i) => i.id === config.integrationId) as
      | PipedreamIntegration
      | undefined
  }, [integrations, trigger])

  const { data: app } = usePipedreamApp(integration?.configuration.appName, {
    withConfig: false,
  })

  return useMemo<string>(() => {
    if (!trigger) return 'Unknown Trigger'

    if (trigger.triggerType === DocumentTriggerType.Scheduled) {
      return 'Schedule'
    }

    if (trigger.triggerType === DocumentTriggerType.Email) {
      return 'Email'
    }

    if (trigger.triggerType === DocumentTriggerType.Integration) {
      const config = trigger.configuration as IntegrationTriggerConfiguration
      const component = app?.triggers.find((c) => c.key === config.componentId)
      return component?.name ?? config.componentId
    }

    return 'Unknown Trigger Type'
  }, [trigger, app])
}
