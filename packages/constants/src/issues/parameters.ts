import { z } from 'zod'
import { parseISO, isValid } from 'date-fns'
import {
  ISSUE_STATUS,
  ISSUE_SORTS,
  SafeIssuesParams,
  DEFAULTS_ISSUE_PARAMS,
  IssueSort,
  IssueStatus,
} from './constants'

const MAX_ISSUES_LIMIT = 100
const LIMIT = DEFAULTS_ISSUE_PARAMS.limit

const ISSUE_STATUS_VALUES = Object.values(ISSUE_STATUS) as [
  IssueStatus,
  ...IssueStatus[],
]
const ISSUE_SORTS_VALUES = Object.values(ISSUE_SORTS) as [
  IssueSort,
  ...IssueSort[],
]
// TODO(AO): Add filter by statuses here

export const issuesFiltersQueryParamsParser = z
  .object({
    documentUuid: z.string().optional().nullable(),
    query: z.string().optional(),
    status: z
      .enum(ISSUE_STATUS_VALUES)
      .optional()
      .default(DEFAULTS_ISSUE_PARAMS.filters.group),
    sort: z
      .enum(ISSUE_SORTS_VALUES)
      .optional()
      .default(DEFAULTS_ISSUE_PARAMS.sorting.sort),
    sortDirection: z
      .enum(['asc', 'desc'])
      .optional()
      .default(DEFAULTS_ISSUE_PARAMS.sorting.sortDirection),
    page: z
      .string()
      .optional()
      .transform((val) => {
        const page = Number(val)
        return Number.isNaN(page) || page < 1 ? 1 : page
      })
      .default(1),
    pageSize: z
      .string()
      .optional()
      .transform((val) => {
        const limit = Number(val)
        if (Number.isNaN(limit) || limit < 1) return LIMIT
        return Math.min(limit, MAX_ISSUES_LIMIT)
      }),
    firstSeen: z
      .string()
      .optional()
      .transform((val) => {
        if (!val) return undefined
        const date = parseISO(val)
        return isValid(date) ? date : undefined
      }),
    lastSeen: z
      .string()
      .optional()
      .transform((val) => {
        if (!val) return undefined
        const date = parseISO(val)
        return isValid(date) ? date : undefined
      }),
  })
  .transform((data): SafeIssuesParams => {
    return {
      page: Number(data.page),
      limit: data.pageSize,
      sorting: {
        sort: data.sort,
        sortDirection: data.sortDirection,
      },
      filters: {
        query: data.query,
        documentUuid: data.documentUuid,
        status: data.status,
        firstSeen: data.firstSeen,
        lastSeen: data.lastSeen,
      },
    }
  })

export type IssuesFiltersQueryParamsOutput = z.output<
  typeof issuesFiltersQueryParamsParser
>

// Soft input type where all fields are strings or undefined
export type IssuesFiltersQueryParamsInput = Record<
  keyof z.input<typeof issuesFiltersQueryParamsParser>,
  string | undefined
>
