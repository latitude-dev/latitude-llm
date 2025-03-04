'use client'
import { Input } from '@latitude-data/web-ui'
import { buildConfigFieldName } from '../../buildIntegrationPayload'
import { HostedIntegrationType } from '@latitude-data/constants'
import { HOSTED_MCP_CONFIGS } from '@latitude-data/core/services/integrations/hostedTypes/index'

export function HostedIntegrationConfiguration({
  type,
}: {
  type: HostedIntegrationType
}) {
  const environmentValues = HOSTED_MCP_CONFIGS[type].env

  return (
    <div className='flex flex-col gap-4'>
      {Object.entries(environmentValues).map(([key, value], idx) => (
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
