import {
  HISTOGRAM_SUBQUERY_ALIAS,
  SafeIssuesParams,
} from '@latitude-data/constants/issues'
import { endOfDay, startOfDay } from 'date-fns'
import { and, eq, inArray, SQL, sql } from 'drizzle-orm'

import { Database } from '../../client'
import { issueHistograms } from '../../schema/models/issueHistograms'
import { type Project } from '../../schema/models/types/Project'
import { histogramStatsSelect } from './histogramStatsSelect'
import { tenancyFilter } from './filters'

type IssueFilters = SafeIssuesParams['filters']

function buildHavingConditions({ filters }: { filters: IssueFilters }) {
  const conditions: SQL[] = []

  if (filters.firstSeen) {
    const fromStartOfDay = startOfDay(filters.firstSeen)
    conditions.push(sql`MIN(${issueHistograms.date}) >= ${fromStartOfDay}`)
  }

  if (filters.lastSeen) {
    const toEndOfDay = endOfDay(filters.lastSeen)
    conditions.push(sql`MAX(${issueHistograms.date}) <= ${toEndOfDay}`)
  }

  return conditions
}

export function getHistogramStatsSubquery(
  {
    workspaceId,
    project,
    commitIds,
    filters,
  }: {
    workspaceId: number
    project: Project
    commitIds: number[]
    filters: IssueFilters
  },
  db: Database,
) {
  const havingConditions = buildHavingConditions({ filters })
  const whereConditions: SQL[] = [
    tenancyFilter(workspaceId),
    eq(issueHistograms.projectId, project.id),
    inArray(issueHistograms.commitId, commitIds),
  ]

  if (filters.documentUuid) {
    whereConditions.push(
      eq(issueHistograms.documentUuid, filters.documentUuid),
    )
  }

  const baseQuery = db
    .select(histogramStatsSelect)
    .from(issueHistograms)
    .where(and(...whereConditions))
    .groupBy(issueHistograms.issueId)

  if (havingConditions.length === 0) {
    return baseQuery.as(HISTOGRAM_SUBQUERY_ALIAS)
  }

  return baseQuery
    .having(and(...havingConditions))
    .as(HISTOGRAM_SUBQUERY_ALIAS)
}
