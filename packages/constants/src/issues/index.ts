export const ISSUE_STATUSES = {
  new: 'new',
  escalating: 'escalating',
  resolved: 'resolved',
  ignored: 'ignored',
} as const

export type IssueStatus = (typeof ISSUE_STATUSES)[keyof typeof ISSUE_STATUSES]

export const ISSUE_SORTS = {
  relevance: 'relevance',
  lastSeen: 'lastSeen',
  firstSeen: 'firstSeen',
} as const

export type IssueSort = (typeof ISSUE_SORTS)[keyof typeof ISSUE_SORTS]

export const QUERY_DIRECTION = {
  backward: 'backward',
  forward: 'forward',
} as const

export type QueryDirection =
  (typeof QUERY_DIRECTION)[keyof typeof QUERY_DIRECTION]

export type SafeIssuesParams = {
  limit: number
  cursor: string | undefined
  sorting: {
    sort: IssueSort
    sortDirection: 'asc' | 'desc'
    direction: QueryDirection
  }
  filters: {
    query?: string
    documentUuid?: string
    statuses?: IssueStatus[]
    firstSeen?: { from: Date; to: Date }
    lastSeen?: { from: Date; to: Date }
  }
}
