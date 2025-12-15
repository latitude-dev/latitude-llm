import { Cursor } from '../../schema/types'
import { DEFAULT_PAGINATION_SIZE, LogSources } from '../../constants'
import {
  parseSafeCreatedAtRange,
  parseSafeCustomIdentifier,
  parseSafeExperimentId,
} from './parseExperimentsFilterParams'

export function parsePage(page: string | null): string {
  if (!page) return '1'

  const parsed = parseInt(page, 10)
  if (isNaN(parsed)) return '1'

  return parsed < 1 ? '1' : parsed.toString()
}

function parsePageSize(pageSize: string | null): string {
  if (!pageSize) return String(DEFAULT_PAGINATION_SIZE)

  const parsed = parseInt(pageSize, 10)
  if (isNaN(parsed)) return String(DEFAULT_PAGINATION_SIZE)

  return parsed < 1 ? String(DEFAULT_PAGINATION_SIZE) : parsed.toString()
}

function parseCommitIds(commitIds: string | undefined) {
  return commitIds?.split(',')?.map?.(Number) ?? []
}

function parseLogSources(logSources: string | undefined) {
  return (logSources?.split?.(',') as LogSources[]) ?? []
}

export function parseSafeFrom(
  from: string | null,
): Cursor<string, number> | null {
  if (!from) return null

  try {
    return JSON.parse(from)
  } catch (_) {
    return null
  }
}

export function parseApiExperimentsParams({
  searchParams,
}: {
  searchParams: URLSearchParams
}) {
  const params = Object.fromEntries(searchParams.entries())
  const commitIds = parseCommitIds(params.commitIds)
  const logSources = parseLogSources(params.logSources)
  const customIdentifier = parseSafeCustomIdentifier(params.customIdentifier)
  const experimentId = parseSafeExperimentId(params.experimentId)
  const excludeErrors = searchParams.get('excludeErrors') === 'true'
  const page = parsePage(searchParams.get('page'))
  const pageSize = parsePageSize(searchParams.get('pageSize'))
  const from = parseSafeFrom(searchParams.get('from'))

  const filterOptions = {
    commitIds,
    logSources,
    createdAt: parseSafeCreatedAtRange(params.createdAt),
    customIdentifier,
    experimentId,
  }

  const isEmptyResponse =
    filterOptions.commitIds.length === 0 ||
    filterOptions.logSources.length === 0

  return {
    excludeErrors,
    isEmptyResponse,
    filterOptions,
    page,
    pageSize,
    from,
  }
}
