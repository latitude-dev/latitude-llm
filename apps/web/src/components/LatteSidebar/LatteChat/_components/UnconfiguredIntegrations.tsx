import { UnconfiguredIntegration } from '$/components/Integrations/UnconfiguredIntegrations'
import useIntegrations from '$/stores/integrations'
import { useLatteStore } from '$/stores/latte'
import { IntegrationType } from '@latitude-data/constants'
import { useEffect, useMemo } from 'react'
import { PipedreamIntegration } from '@latitude-data/core/schema/types'

export function LatteUnconfiguredIntegrations() {
  const { data: integrations, mutate } = useIntegrations()
  const { newIntegrationIds } = useLatteStore()

  const newUnconfiguredIntegrations = useMemo(() => {
    return integrations.filter((integration) => {
      if (!newIntegrationIds.includes(integration.id)) return false
      if (integration.type !== IntegrationType.Pipedream) return false
      return !('connectionId' in integration.configuration)
    }) as PipedreamIntegration[]
  }, [integrations, newIntegrationIds])

  useEffect(() => {
    const timeout = setTimeout(() => {
      mutate()
    }, 1000)
    return () => clearTimeout(timeout)
  }, [newIntegrationIds, mutate])

  return (
    <div className='flex flex-col gap-2 w-full px-8'>
      {newUnconfiguredIntegrations.map((integration) => (
        <UnconfiguredIntegration
          key={integration.id}
          integration={integration}
        />
      ))}
    </div>
  )
}
