export const ISSUE_STATUS = {
  active: 'active', // not resolved, not ignored
  regressed: 'regressed', // resolved with histogram dates after the resolved date
  archived: 'archived', // resolved or ignored
} as const

export type IssueStatus = (typeof ISSUE_STATUS)[keyof typeof ISSUE_STATUS]
export const ISSUE_SORTS = { relevance: 'relevance' } as const

export type IssueSort = (typeof ISSUE_SORTS)[keyof typeof ISSUE_SORTS]
export type SafeIssuesParams = {
  limit: number
  page: number
  sorting: {
    sort: IssueSort
    sortDirection: 'asc' | 'desc'
  }
  filters: {
    query?: string
    documentUuid?: string | null
    status?: IssueStatus
    firstSeen?: Date
    lastSeen?: Date
  }
}

export const ESCALATING_COUNT_THRESHOLD = 10
export const ESCALATING_DAYS = 2
export const NEW_ISSUES_DAYS = 7
export const RECENT_ISSUES_DAYS = 7
export const HISTOGRAM_SUBQUERY_ALIAS = 'histogramStats'
export type QueryParams = { [key: string]: string | string[] | undefined }

export const DEFAULTS_ISSUE_PARAMS = {
  limit: 25,
  filters: {
    status: ISSUE_STATUS.active,
  },
  sorting: {
    sort: 'relevance' as const,
    sortDirection: 'desc' as const,
  },
}
