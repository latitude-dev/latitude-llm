import { ReactNode, useMemo } from 'react'
import { DocumentTrigger } from '@latitude-data/core/schema/models/types/DocumentTrigger'
import {
  IntegrationDto,
  PipedreamIntegration,
} from '@latitude-data/core/schema/models/types/Integration'
import { DocumentTriggerType } from '@latitude-data/constants'
import { Icon, IconProps } from '@latitude-data/web-ui/atoms/Icons'
import { ICONS_BY_TRIGGER } from '../NewTrigger/IntegrationsList'
import { IntegrationIcon } from '$/components/Integrations/IntegrationIcon'
import { IntegrationTriggerConfiguration } from '@latitude-data/constants/documentTriggers'

type UseTriggerIconParams = {
  trigger?: DocumentTrigger
  integrations: IntegrationDto[]
  size?: number
  iconSize?: IconProps['size']
  className?: string
}

/**
 * Hook to get the appropriate icon for a trigger.
 * Handles all trigger types: Scheduled, Email, and Integration triggers.
 */
export function useTriggerIcon({
  trigger,
  integrations,
  size = 16,
  iconSize = 'normal',
  className = '',
}: UseTriggerIconParams): ReactNode {
  const integration = useMemo(() => {
    if (!trigger) return undefined
    if (trigger.triggerType !== DocumentTriggerType.Integration) {
      return undefined
    }

    const config = trigger.configuration as IntegrationTriggerConfiguration
    return integrations.find((i) => i.id === config.integrationId) as
      | PipedreamIntegration
      | undefined
  }, [integrations, trigger])

  return useMemo<ReactNode>(() => {
    // For non-integration triggers (Scheduled, Email), use the icon map. Otherwise, use the zap icon.
    const iconName =
      (trigger ? ICONS_BY_TRIGGER[trigger?.triggerType] : undefined) ?? 'zap'

    // For Integration triggers, use the integration's icon
    if (
      trigger?.triggerType === DocumentTriggerType.Integration &&
      integration
    ) {
      return (
        <IntegrationIcon
          integration={integration}
          size={size}
          className={className}
        />
      )
    }

    return <Icon name={iconName} size={iconSize} className={className} />
  }, [trigger, integration, size, iconSize, className])
}
