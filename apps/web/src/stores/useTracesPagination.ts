import { SearchFilter } from '@latitude-data/core/browser'
import useSWR, { SWRConfiguration } from 'swr'
import useFetcher from '$/hooks/useFetcher'

type TracesQueryParams = {
  projectId: number
  page: number
  pageSize: number
  filters?: SearchFilter[]
}

export default function useTracesPagination(
  { projectId, page, pageSize, filters }: TracesQueryParams,
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
    `/api/projects/${projectId}/traces?${searchParams.toString()}`,
    {
      serializer,
      fallback: options?.fallbackData,
    },
  )

  return useSWR(
    ['traces', projectId, page, pageSize, filters],
    fetcher,
    options,
  )
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
