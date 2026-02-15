import {
  HISTOGRAM_SUBQUERY_ALIAS,
} from '@latitude-data/constants/issues'
import { and, eq } from 'drizzle-orm'

import { Database } from '../../client'
import { issueHistograms } from '../../schema/models/issueHistograms'
import { type Project } from '../../schema/models/types/Project'
import { histogramStatsSelect } from './histogramStatsSelect'
import { tenancyFilter } from './filters'

export function getHistogramStatsForIssue(
  {
    workspaceId,
    project,
    issueId,
  }: {
    workspaceId: number
    project: Project
    issueId: number
  },
  db: Database,
) {
  return db
    .select(histogramStatsSelect)
    .from(issueHistograms)
    .where(
      and(
        tenancyFilter(workspaceId),
        eq(issueHistograms.projectId, project.id),
        eq(issueHistograms.issueId, issueId),
      ),
    )
    .groupBy(issueHistograms.issueId)
    .as(HISTOGRAM_SUBQUERY_ALIAS)
}
