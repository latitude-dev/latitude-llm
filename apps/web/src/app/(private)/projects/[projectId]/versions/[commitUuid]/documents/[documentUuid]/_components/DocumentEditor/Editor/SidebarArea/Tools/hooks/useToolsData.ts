import useIntegrations from '$/stores/integrations'
import { useMemo } from 'react'

export function useToolsData() {
  // Fetch integrations that include Latitude tools and have tools
  const { data: integrations, isLoading } = useIntegrations({
    includeLatitudeTools: true,
    withTools: true,
  })
  return useMemo(() => ({ integrations, isLoading }), [integrations, isLoading])
}
