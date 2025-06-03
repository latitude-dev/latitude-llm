import { DEFAULT_PAGINATION_SIZE, LogSources } from '../../../constants'
import {
  parseSafeCreatedAtRange,
  parseSafeCustomIdentifier,
  parseSafeExperimentId,
} from './parseLogFilterParams'

export function parsePositiveNumber(
  value: string | null,
  defaultValue: number,
): number {
  if (!value) return defaultValue
  const parsed = parseInt(value, 10)
  if (isNaN(parsed)) return defaultValue
  return parsed < 1 ? defaultValue : parsed
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
  const customIdentifier = parseSafeCustomIdentifier(params.customIdentifier)
  const experimentId = parseSafeExperimentId(params.experimentId)
  const excludeErrors = searchParams.get('excludeErrors') === 'true'

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
    page: parsePositiveNumber(searchParams.get('page'), 1),
    size: parsePositiveNumber(
      searchParams.get('pageSize'),
      DEFAULT_PAGINATION_SIZE,
    ),
  }
}
