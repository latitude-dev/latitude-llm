import Image from 'next/image'
import { IntegrationDto } from '@latitude-data/core/schema/models/types/Integration'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { IntegrationType } from '@latitude-data/constants'
import {
  INTEGRATION_TYPE_VALUES,
  HOSTED_INTEGRATION_TYPE_OPTIONS,
} from '$/lib/integrationTypeOptions'

type IntegrationIconProps = {
  integration: IntegrationDto
  size?: number
  className?: string
}

/**
 * Renders the appropriate icon for an integration.
 * Handles Pipedream integrations with custom images, HostedMCP integrations,
 * and standard integration types with icon names.
 */
export function IntegrationIcon({
  integration,
  size = 16,
  className = '',
}: IntegrationIconProps) {
  // Pipedream integrations: use metadata imageUrl if available
  if (integration.type === IntegrationType.Pipedream) {
    const imageUrl = integration.configuration.metadata?.imageUrl
    if (imageUrl) {
      return (
        <Image
          src={imageUrl}
          alt={integration.name}
          width={size}
          height={size}
          className={className}
          unoptimized
        />
      )
    }
    // Fallback to unplug icon for Pipedream without image
    return (
      <Icon
        name='unplug'
        size={size === 16 ? 'normal' : 'large'}
        className={className}
      />
    )
  }

  // HostedMCP integrations: use HOSTED_INTEGRATION_TYPE_OPTIONS
  if (
    integration.type === IntegrationType.HostedMCP &&
    Object.keys(HOSTED_INTEGRATION_TYPE_OPTIONS).includes(
      integration.configuration.type,
    )
  ) {
    const { icon } =
      HOSTED_INTEGRATION_TYPE_OPTIONS[integration.configuration.type]

    if (icon.type === 'image') {
      return (
        <Image
          src={icon.src}
          alt={icon.alt}
          width={size}
          height={size}
          className={className}
          unoptimized
        />
      )
    }

    return (
      <Icon
        name={icon.name}
        size={size === 16 ? 'normal' : 'large'}
        className={className}
      />
    )
  }

  // Standard integration types: use INTEGRATION_TYPE_VALUES
  const { icon } = INTEGRATION_TYPE_VALUES[integration.type]

  if (icon.type === 'image') {
    return (
      <Image
        src={icon.src}
        alt={icon.alt}
        width={size}
        height={size}
        className={className}
        unoptimized
      />
    )
  }

  return (
    <Icon
      name={icon.name}
      size={size === 16 ? 'normal' : 'large'}
      className={className}
    />
  )
}
