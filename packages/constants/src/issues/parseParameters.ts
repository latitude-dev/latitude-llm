import {
  IssuesFiltersQueryParamsInput,
  IssuesFiltersQueryParamsOutput,
  issuesFiltersQueryParamsParser,
} from './parameters'
import {
  DEFAULTS_ISSUE_PARAMS,
  QueryParams,
  SafeIssuesParams,
} from './constants'

export function parseIssuesQueryParams({
  params,
  defaultFilters,
}: {
  params: URLSearchParams | QueryParams
  defaultFilters?: Pick<IssuesFiltersQueryParamsInput, 'documentUuid'>
}): IssuesFiltersQueryParamsOutput {
  const parsed = issuesFiltersQueryParamsParser.parse(
    params instanceof URLSearchParams ? Object.fromEntries(params) : params,
  )
  return {
    ...parsed,
    filters: {
      ...parsed.filters,
      documentUuid: parsed.filters.documentUuid ?? defaultFilters?.documentUuid,
    },
  }
}

function formatDateLocal(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function convertIssuesParamsToQueryParams(
  params: SafeIssuesParams,
): Partial<IssuesFiltersQueryParamsInput> {
  const {
    filters = {},
    page,
    limit,
    sorting = DEFAULTS_ISSUE_PARAMS.sorting,
  } = params

  const { query, documentUuid, status, firstSeen, lastSeen } = filters

  const rawParams = {
    query,
    documentUuid,
    status,
    firstSeen: firstSeen ? formatDateLocal(firstSeen) : undefined,
    lastSeen: lastSeen ? formatDateLocal(lastSeen) : undefined,
    page: page > 1 ? page.toString() : undefined,
    pageSize:
      limit !== DEFAULTS_ISSUE_PARAMS.limit ? limit.toString() : undefined,
    sort:
      sorting.sort !== DEFAULTS_ISSUE_PARAMS.sorting.sort
        ? sorting.sort
        : undefined,
    sortDirection:
      sorting.sortDirection !== DEFAULTS_ISSUE_PARAMS.sorting.sortDirection
        ? sorting.sortDirection
        : undefined,
  }

  return Object.fromEntries(
    Object.entries(rawParams).filter(([_, value]) => value !== undefined),
  )
}

/**
 * SWR cache key for issues list based on filters and sorting
 */
export function buildIssuesCacheKey({
  projectId,
  commitUuid,
  searchParams,
}: {
  projectId: number
  commitUuid: string
  searchParams: Partial<IssuesFiltersQueryParamsInput>
}) {
  return [
    'issues',
    String(projectId),
    commitUuid,
    `query:${searchParams.query || '-'}`,
    `status:${searchParams.status ?? '-'}`,
    `sort:${searchParams.sort || '-'}`,
    `sortDirection:${searchParams.sortDirection || '-'}`,
    `documentUuid:${searchParams.documentUuid || '-'}`,
    `pageSize:${searchParams.pageSize || '-'}`,
    `firstSeen:${searchParams.firstSeen || '-'}`,
    `lastSeen:${searchParams.lastSeen || '-'}`,
    ...(searchParams.page ? [`page:${searchParams.page}`] : []),
  ].join('|')
}
