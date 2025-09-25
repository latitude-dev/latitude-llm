import { useConfigureIntegrationAccount } from '$/hooks/useConfigureIntegrationAccount'
import { IntegrationType } from '@latitude-data/constants'
import {
  IntegrationDto,
  PipedreamIntegration,
} from '@latitude-data/core/schema/types'
import { isIntegrationConfigured } from '@latitude-data/core/services/integrations/pipedream/components/fillConfiguredProps'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import Image from 'next/image'
import { useMemo } from 'react'

export function UnconfiguredIntegration({
  integration,
}: {
  integration: PipedreamIntegration
}) {
  const { isLoading, connectAccount, isUpdating } =
    useConfigureIntegrationAccount({
      integration,
    })

  return (
    <div className='flex flex-row px-4 py-3 gap-3 border border-latte-border bg-latte-background rounded-xl items-center'>
      <Image
        src={integration.configuration.metadata?.imageUrl ?? ''}
        alt={integration.name}
        className='max-w-6 max-h-6'
        width={24}
        height={24}
        unoptimized
      />

      <div className='flex-1'>
        <Text.H5 color='latteOutputForeground'>
          '{integration.name}' integration needs additional configuration
        </Text.H5>
      </div>

      <Button
        fancy
        variant='outline'
        disabled={isLoading}
        onClick={connectAccount}
        isLoading={isUpdating}
      >
        Set up
      </Button>
    </div>
  )
}

export function UnconfiguredIntegrations({
  integrations,
}: {
  integrations: IntegrationDto[]
}) {
  const unconfiguredIntegrations = useMemo(
    () =>
      integrations.filter((integration) => {
        return (
          integration.type === IntegrationType.Pipedream &&
          !isIntegrationConfigured(integration)
        )
      }) as PipedreamIntegration[],
    [integrations],
  )

  if (unconfiguredIntegrations.length === 0) return null

  return (
    <div className='flex flex-col gap-2'>
      {unconfiguredIntegrations.map((integration) => (
        <UnconfiguredIntegration
          key={integration.id}
          integration={integration}
        />
      ))}
    </div>
  )
}

export function getPipedreamUnconfiguredIntegrations(
  integrations: IntegrationDto[],
) {
  return integrations.filter((integration) => {
    return (
      integration.type === IntegrationType.Pipedream &&
      !isIntegrationConfigured(integration)
    )
  })
}
