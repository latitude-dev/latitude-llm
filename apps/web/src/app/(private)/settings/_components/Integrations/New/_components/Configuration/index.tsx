'use client'
import {
  HostedIntegrationType,
  IntegrationType,
} from '@latitude-data/constants'
import { ExternalIntegrationConfiguration } from './External'
import { PipedreamIntegrationConfigurationSchema } from './Pipedream'
import { IntegrationConfiguration } from '@latitude-data/core/services/integrations/helpers/schema'

export function IntegrationConfigurationForm({
  integrationType,
  create,
}: {
  integrationType: IntegrationType | HostedIntegrationType | string
  create: (_: {
    type: IntegrationType
    configuration: IntegrationConfiguration
  }) => void
}) {
  if (integrationType === IntegrationType.ExternalMCP) {
    return <ExternalIntegrationConfiguration create={create} />
  }

  return (
    <PipedreamIntegrationConfigurationSchema
      type={integrationType}
      create={create}
    />
  )
}
