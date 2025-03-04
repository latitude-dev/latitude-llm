'use client'
import {
  HostedIntegrationType,
  IntegrationType,
} from '@latitude-data/constants'
import { FormFieldGroup } from '@latitude-data/web-ui'
import { ExternalIntegrationConfiguration } from './External'
import { HostedIntegrationConfiguration } from './Hosted'

export function IntegrationConfigurationForm({
  integrationType,
}: {
  integrationType: IntegrationType | HostedIntegrationType
}) {
  return (
    <FormFieldGroup layout='vertical'>
      {integrationType === IntegrationType.ExternalMCP && (
        <ExternalIntegrationConfiguration />
      )}
      {Object.values(HostedIntegrationType).includes(
        integrationType as HostedIntegrationType,
      ) && (
        <HostedIntegrationConfiguration
          type={integrationType as HostedIntegrationType}
        />
      )}
    </FormFieldGroup>
  )
}
