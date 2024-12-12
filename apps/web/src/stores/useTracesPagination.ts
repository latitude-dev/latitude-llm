import { SearchFilter } from '@latitude-data/core/browser'
import useSWR, { SWRConfiguration } from 'swr'
import useFetcher from '$/hooks/useFetcher'
import { ROUTES } from '$/services/routes'

type TracesQueryParams = {
  page: number
  pageSize: number
  filters?: SearchFilter[]
}

export default function useTracesPagination(
  { page, pageSize, filters }: TracesQueryParams,
  options?: SWRConfiguration,
) {
  const searchParams = new URLSearchParams({
    page: page.toString(),
    pageSize: pageSize.toString(),
  })

  if (filters?.length) {
    searchParams.append('filters', JSON.stringify(filters))
  }

  const fetcher = useFetcher(
    `${ROUTES.api.traces.root}?${searchParams.toString()}`,
    {
      serializer,
      fallback: options?.fallbackData,
    },
  )

  return useSWR(['traces', page, pageSize, filters], fetcher, options)
}

function serializer(data: any) {
  return {
    ...data,
    items: data.items.map(serializeTrace),
  }
}

export function serializeTrace(trace: any) {
  return {
    ...trace,
    startTime: new Date(trace.startTime),
  }
}
