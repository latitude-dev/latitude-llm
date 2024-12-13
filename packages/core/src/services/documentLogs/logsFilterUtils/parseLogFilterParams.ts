import { parseISO } from 'date-fns'
import { Commit, LOG_SOURCES, LogSources } from '../../../browser'
import { QueryParams } from '../../../lib/pagination/buildPaginatedUrl'
import { formatDocumentLogCreatedAtParam } from './generateDocumentLogsApiRouteWithParams'

function parseLogSourcesSafe(origins: string[] | string | undefined) {
  const logSources = (origins?.toString()?.split(',') ??
    LOG_SOURCES) as LogSources[]
  return logSources.filter((s) => LOG_SOURCES.includes(s as LogSources))
}

export function parseSafeCreatedAtRange(
  createdAt: string[] | string | undefined,
) {
  const [rawFrom, rawTo] = createdAt?.toString()?.split(',') ?? []

  // URL encoding replaces '+' with ' ' so we need to replace it back
  const from = rawFrom?.replace(' ', '+')
  const to = rawTo?.replace(' ', '+')

  return {
    from: from ? parseISO(from) : undefined,
    to: to ? parseISO(to) : undefined,
  }
}

export function parseLogFiltersParams({
  params,
  currentCommit,
  commits,
}: {
  params: QueryParams
  currentCommit: Commit
  commits: Commit[]
}) {
  const originalSelectedCommitsIds = [
    ...commits.filter((c) => !!c.mergedAt).map((c) => c.id),
    ...(!currentCommit.mergedAt ? [currentCommit.id] : []),
  ]
  const { versions, origins, createdAt: createdAtParam } = params
  const commitIds =
    versions?.toString()?.split(',')?.map(Number) ?? originalSelectedCommitsIds
  const logSources = parseLogSourcesSafe(origins)
  const createdAt = parseSafeCreatedAtRange(createdAtParam)
  const formattedCreatedAt = formatDocumentLogCreatedAtParam(createdAt)

  return {
    filterOptions: {
      commitIds,
      logSources,
      createdAt,
    },
    formattedCreatedAt,
    originalSelectedCommitsIds,
    redirectUrlParams: [
      versions ? `versions=${versions}` : undefined,
      origins ? `origins=${origins}` : undefined,
      formattedCreatedAt ? formattedCreatedAt.urlParam : undefined,
    ],
  }
}
