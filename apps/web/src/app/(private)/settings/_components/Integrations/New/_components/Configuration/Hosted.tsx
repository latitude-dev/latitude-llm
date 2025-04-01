'use client'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Input } from '@latitude-data/web-ui/atoms/Input'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { buildConfigFieldName } from '../../buildIntegrationPayload'
import { HostedIntegrationType } from '@latitude-data/constants'
import { HOSTED_MCP_CONFIGS } from '@latitude-data/core/services/integrations/hostedTypes/index'
import Link from 'next/link'

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
      {environmentValues?.envSource && (
        <Link href={environmentValues.envSource} target='_blank'>
          <Button
            type='button'
            variant='link'
            className='p-0'
            iconProps={{ name: 'externalLink', placement: 'right' }}
          >
            How to obtain these values
          </Button>
        </Link>
      )}
    </div>
  )
}
