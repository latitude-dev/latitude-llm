import { buildPaginatedUrl } from '@latitude-data/core/lib/pagination/buildPaginatedUrl'
import useFetcher from '$/hooks/useFetcher'
import useSWR from 'swr'

export default function useTracesPagination({
  projectId,
  page,
  pageSize,
}: {
  projectId: number
  page: number
  pageSize: number
}) {
  const url = buildPaginatedUrl({
    baseUrl: `/api/projects/${projectId}/traces`,
    page,
    pageSize,
  })

  const fetcher = useFetcher(url, { serializer })

  return useSWR(url, fetcher)
}

function serializer(data: any) {
  return {
    ...data,
    items: data.items.map(serializeTrace),
  }
}

function serializeTrace(trace: any) {
  return {
    ...trace,
    startTime: new Date(trace.startTime),
  }
}
