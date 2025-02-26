'use client'
import { IntegrationType } from '@latitude-data/constants'
import { FormFieldGroup } from '@latitude-data/web-ui'
import { CustomMcpIntegration } from './CustomMcpIntegration'
import { McpServerIntegration } from './McpServerIntegration'

export function IntegrationConfigurationForm({
  integrationType,
}: {
  integrationType: IntegrationType
}) {
  return (
    <FormFieldGroup label='Integration Configuration' layout='vertical'>
      {integrationType === IntegrationType.CustomMCP && (
        <CustomMcpIntegration />
      )}
      {integrationType === IntegrationType.MCPServer && (
        <McpServerIntegration />
      )}
    </FormFieldGroup>
  )
}
