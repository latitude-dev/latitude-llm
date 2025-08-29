import useFetcher from '$/hooks/useFetcher'
import { API_ROUTES } from '$/services/routes/api'
import { useMemo } from 'react'
import useSWR, { SWRConfiguration } from 'swr'

type FeatureStatus = {
  enabled: boolean
}

export default function useFeature(
  featureName: string,
  opts?: SWRConfiguration,
) {
  const key = featureName ? `api/workspaceFeatures/${featureName}` : null

  const fetcher = useFetcher<FeatureStatus>(
    featureName ? API_ROUTES.workspaceFeatures.byName(featureName) : '',
  )

  const { data, isLoading, ...rest } = useSWR<FeatureStatus>(key, fetcher, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    ...opts,
  })

  return useMemo(
    () => ({
      isEnabled: data?.enabled ?? false,
      isLoading,
      ...rest,
    }),
    [data, isLoading, rest],
  )
}
