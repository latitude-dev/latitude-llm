import { IntegrationType } from '@latitude-data/constants'
import {
  IntegrationDto,
  PipedreamIntegration,
} from '@latitude-data/core/schema/models/types/Integration'
import { isIntegrationConfigured } from '@latitude-data/core/services/integrations/pipedream/components/fillConfiguredProps'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import {
  StatusFlag,
  StatusFlagState,
} from '@latitude-data/web-ui/molecules/StatusFlag'
import { useMemo } from 'react'
import { IntegrationIcon } from './IntegrationIcon'

export function ConfiguredIntegration({
  integration,
}: {
  integration: PipedreamIntegration
}) {
  return (
    <div className='flex flex-row px-4 py-3 gap-3 bg-secondary rounded-xl items-center min-h-[60px]'>
      <div className='relative'>
        <IntegrationIcon
          integration={integration}
          size={24}
          className='max-w-6 max-h-6'
        />
        <div className='absolute -top-1 -right-1'>
          <StatusFlag
            state={StatusFlagState.completed}
            backgroundColor='successMutedForeground'
          />
        </div>
      </div>
      <div className='flex-1'>
        <Text.H5 color='foregroundMuted'>
          <Text.H5B color='foregroundMuted'>
            {integration.configuration.metadata?.displayName}{' '}
          </Text.H5B>
          integration is configured successfully
        </Text.H5>
      </div>
    </div>
  )
}

export function ConfiguredIntegrations({
  integrations,
}: {
  integrations: IntegrationDto[]
}) {
  const configuredIntegrations = useMemo(
    () =>
      integrations.filter((integration) => {
        return (
          integration.type === IntegrationType.Pipedream &&
          isIntegrationConfigured(integration)
        )
      }) as PipedreamIntegration[],
    [integrations],
  )

  if (configuredIntegrations.length === 0) return null

  return (
    <div className='flex flex-col gap-2 w-full'>
      {configuredIntegrations.map((integration) => (
        <ConfiguredIntegration key={integration.id} integration={integration} />
      ))}
    </div>
  )
}
