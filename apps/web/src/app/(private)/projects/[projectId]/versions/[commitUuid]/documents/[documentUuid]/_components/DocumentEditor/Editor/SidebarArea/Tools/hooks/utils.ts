import { IntegrationType } from '@latitude-data/constants'
import { INTEGRATION_TYPE_VALUES } from '$/lib/integrationTypeOptions'
import { IntegrationDto } from '@latitude-data/core/schema/types'
import { IconName } from '@latitude-data/web-ui/atoms/Icons'

export function integrationOptions(integration: IntegrationDto) {
  if (integration.type === IntegrationType.Pipedream) {
    const imageUrl = integration.configuration.metadata?.imageUrl ?? 'unplug'
    const label =
      integration.configuration.metadata?.displayName ??
      integration.configuration.appName
    return {
      label,
      icon: {
        type: 'image' as const,
        src: imageUrl,
        alt: label,
      },
    }
  }

  if (integration.type === IntegrationType.Latitude) {
    const { label } = INTEGRATION_TYPE_VALUES[IntegrationType.Latitude]
    return {
      label,
      icon: {
        type: 'icon' as const,
        name: 'logo' as IconName,
      },
    }
  }
  const { label, icon } = INTEGRATION_TYPE_VALUES[integration.type]
  return { label, icon: { type: 'icon' as const, name: icon as IconName } }
}
