import useFetcher from '$/hooks/useFetcher'
import { useMemo } from 'react'
import useSWR, { SWRConfiguration } from 'swr'
import { ROUTES } from '$/services/routes'
import { Providers } from '@latitude-data/constants'
import { ModelCostResponse } from '$/app/api/models/cost/route'

export function useModelsCost(
  models: {
    provider: Providers
    model: string
  }[],
  opts?: SWRConfiguration,
) {
  const route = models.length > 0 ? ROUTES.api.models.cost.root : undefined

  const key = useMemo(() => {
    if (models.length === 0) return null
    const sorted = models.map((m) => `${m.provider}/${m.model}`).sort()
    return ['modelsCost', ...sorted]
  }, [models])

  const searchParams = useMemo(() => {
    const params = new URLSearchParams()
    for (const model of models) {
      params.append('model', `${model.provider}/${model.model}`)
    }
    return params
  }, [models])

  const fetcher = useFetcher<ModelCostResponse>(route, {
    searchParams,
    fallback: undefined,
  })

  return useSWR<ModelCostResponse>(key, fetcher, opts)
}
