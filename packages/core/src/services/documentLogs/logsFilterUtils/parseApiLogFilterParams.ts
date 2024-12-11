import { DEFAULT_PAGINATION_SIZE, LogSources } from '../../../constants'
import { parseSafeCreatedAtRange } from './parseLogFilterParams'

function parsePage(page: string | null): string {
  if (!page) return '1'

  const parsed = parseInt(page, 10)
  if (isNaN(parsed)) return '1'

  return parsed < 1 ? '1' : parsed.toString()
}

function parseCommitIds(commitIds: string | undefined) {
  return commitIds?.split(',')?.map?.(Number) ?? []
}

function parseLogSources(logSources: string | undefined) {
  return (logSources?.split?.(',') as LogSources[]) ?? []
}

export function parseApiDocumentLogParams({
  searchParams,
}: {
  searchParams: URLSearchParams
}) {
  const params = Object.fromEntries(searchParams.entries())
  const commitIds = parseCommitIds(params.commitIds)
  const logSources = parseLogSources(params.logSources)
  const excludeErrors = searchParams.get('excludeErrors') === 'true'

  const filterOptions = {
    commitIds,
    logSources,
    createdAt: parseSafeCreatedAtRange(params.createdAt),
  }

  const isEmptyResponse =
    filterOptions.commitIds.length === 0 ||
    filterOptions.logSources.length === 0

  return {
    excludeErrors,
    isEmptyResponse,
    filterOptions,
    page: parsePage(searchParams.get('page')),
    pageSize: searchParams.get('pageSize') ?? String(DEFAULT_PAGINATION_SIZE),
  }
}
