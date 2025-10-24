export const ISSUE_STATUSES = {
  NEW: 'new',
  ESCALATING: 'escalating',
  RESOLVED: 'resolved',
  IGNORED: 'ignored',
} as const

export type IssueStatus = (typeof ISSUE_STATUSES)[keyof typeof ISSUE_STATUSES]
