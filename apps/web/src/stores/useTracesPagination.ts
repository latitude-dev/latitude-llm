import { TraceWithSpans } from '@latitude-data/core/browser'
import { buildPaginatedUrl } from '@latitude-data/core/lib/pagination/buildPaginatedUrl'
import useFetcher from '$/hooks/useFetcher'
import useSWR, { SWRConfiguration } from 'swr'

export default function useTracesPagination(
  {
    projectId,
    page,
    pageSize,
  }: {
    projectId: number
    page: number
    pageSize: number
  },
  opts: SWRConfiguration,
) {
  const url = buildPaginatedUrl({
    baseUrl: `/api/projects/${projectId}/traces`,
    page,
    pageSize,
  })

  const fetcher = useFetcher(url, { serializer })

  return useSWR<{
    items: TraceWithSpans[]
    count: number
    page: number
    pageSize: number
  }>(url, fetcher, opts)
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
