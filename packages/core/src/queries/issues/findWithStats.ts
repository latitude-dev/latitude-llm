import { and, eq } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'

import { commits } from '../../schema/models/commits'
import { issues } from '../../schema/models/issues'
import { type Project } from '../../schema/models/types/Project'
import { scopedQuery } from '../scope'
import { getHistogramStatsForIssue } from '../issueHistograms/getHistogramStatsForIssue'
import { tt } from './columns'
import { tenancyFilter } from './filters'
import { issuesWithStatsSelect } from './groupConditions'

export const findIssueWithStats = scopedQuery(
  async function findIssueWithStats(
    {
      workspaceId,
      project,
      issueId,
    }: {
      workspaceId: number
      project: Project
      issueId: number
    },
    db,
  ) {
    const subquery = getHistogramStatsForIssue(
      { workspaceId, project, issueId },
      db,
    )
    const mergedIssues = alias(issues, 'mergedIssues')
    const lastCommit = alias(commits, 'lastCommit')
    const result = await db
      .select({
        ...tt,
        ...issuesWithStatsSelect({ subquery }),
        mergedToIssue: {
          id: mergedIssues.id,
          title: mergedIssues.title,
          uuid: mergedIssues.uuid,
        },
        lastCommit: {
          uuid: lastCommit.uuid,
          title: lastCommit.title,
          version: lastCommit.version,
        },
      })
      .from(issues)
      .innerJoin(subquery, eq(subquery.issueId, issues.id))
      .leftJoin(mergedIssues, eq(issues.mergedToIssueId, mergedIssues.id))
      .innerJoin(lastCommit, eq(subquery.lastCommitId, lastCommit.id))
      .where(
        and(
          tenancyFilter(workspaceId),
          eq(issues.projectId, project.id),
          eq(issues.id, issueId),
        ),
      )
      .limit(1)

    return result[0]
  },
)
