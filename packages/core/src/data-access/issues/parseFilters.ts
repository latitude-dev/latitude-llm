import { z } from 'zod'
import {
  ISSUE_STATUSES,
  ISSUE_SORTS,
  SafeIssuesParams,
  QUERY_DIRECTION,
} from '@latitude-data/constants/issues'
import { parseISO, isValid } from 'date-fns'

export const issuesFiltersQueryParamsParser = z
  .object({
    documentUuid: z.string().optional(),
    query: z.string().optional(),
    statuses: z.enum(ISSUE_STATUSES).array().optional(),
    sort: z.enum(ISSUE_SORTS).optional().default('relevance'),
    sortDirection: z.enum(['asc', 'desc']).optional().default('desc'),
    direction: z.enum(QUERY_DIRECTION).optional().default('forward'),
    firstSeenFrom: z.string().optional(),
    firstSeenTo: z.string().optional(),
    lastSeenFrom: z.string().optional(),
    lastSeenTo: z.string().optional(),
    cursor: z.string().optional(),
    limit: z.coerce.number().min(1).max(100).optional().default(25),
  })
  .transform(
    ({
      firstSeenFrom,
      firstSeenTo,
      lastSeenFrom,
      lastSeenTo,
      ...rest
    }): SafeIssuesParams => {
      const common = {
        limit: rest.limit,
        direction: rest.direction,
        sorting: {
          sort: rest.sort,
          sortDirection: rest.sortDirection,
          direction: rest.direction,
        },
        filters: {
          query: rest.query,
          documentUuid: rest.documentUuid,
          statuses: rest.statuses,
        },
      }

      if (firstSeenFrom && firstSeenTo) {
        const from = parseISO(firstSeenFrom)
        const to = parseISO(firstSeenTo)
        if (isValid(from) && isValid(to)) {
          return {
            ...common,
            filters: {
              ...common.filters,
              firstSeen: { from, to },
            },
          }
        }
      }

      if (lastSeenFrom && lastSeenTo) {
        const from = parseISO(lastSeenFrom)
        const to = parseISO(lastSeenTo)
        if (isValid(from) && isValid(to)) {
          return {
            ...common,
            filters: {
              ...common.filters,
              lastSeen: { from, to },
            },
          }
        }
      }

      return common
    },
  )
