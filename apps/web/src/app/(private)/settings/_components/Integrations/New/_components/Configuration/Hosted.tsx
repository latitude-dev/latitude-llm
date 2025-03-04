'use client'
import { Input, Text } from '@latitude-data/web-ui'
import { buildConfigFieldName } from '../../buildIntegrationPayload'
import { HostedIntegrationType } from '@latitude-data/constants'
import { HOSTED_MCP_CONFIGS } from '@latitude-data/core/services/integrations/hostedTypes/index'

export function HostedIntegrationConfiguration({
  type,
}: {
  type: HostedIntegrationType
}) {
  const environmentValues = HOSTED_MCP_CONFIGS[type]
  const envVars = environmentValues?.env
    ? Object.entries(environmentValues.env)
    : []

  return (
    <div className='flex flex-col gap-4'>
      {environmentValues?.description && (
        <Text.H6 color='foregroundMuted'>
          {environmentValues.description}
        </Text.H6>
      )}
      {envVars.map(([key, value], idx) => (
        <Input
          key={idx}
          required={value.required}
          type='text'
          name={buildConfigFieldName({
            fieldNamespace: key,
            namespace: '[configuration][env]',
          })}
          label={value.label}
          description={value.description}
          placeholder={value.placeholder}
        />
      ))}
    </div>
  )
}
