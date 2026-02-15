import { IssueGroup } from '@latitude-data/constants/issues'
import { and, desc, eq, ilike, SQL } from 'drizzle-orm'

import { CommitsRepository } from '../../repositories/commitsRepository'
import { issues } from '../../schema/models/issues'
import { type Commit } from '../../schema/models/types/Commit'
import { type DocumentVersion } from '../../schema/models/types/DocumentVersion'
import { type Project } from '../../schema/models/types/Project'
import { scopedQuery } from '../scope'
import { getHistogramStatsSubquery } from '../issueHistograms/getHistogramStatsSubquery'
import { tenancyFilter } from './filters'
import { buildGroupConditions } from './groupConditions'

export const findIssuesByTitleAndStatuses = scopedQuery(
  async function findIssuesByTitleAndStatuses(
    {
      workspaceId,
      project,
      commit,
      document,
      title,
      group,
    }: {
      workspaceId: number
      project: Project
      commit: Commit
      document: DocumentVersion
      title: string | null
      group?: IssueGroup
    },
    db,
  ) {
    const whereConditions: SQL[] = []
    const groupConditions = buildGroupConditions(group)
    if (groupConditions) {
      whereConditions.push(groupConditions)
    }
    const commitIds = await getCommitIds({ workspaceId, commit }, db)
    const subquery = getHistogramStatsSubquery(
      {
        workspaceId,
        project,
        commitIds,
        filters: { documentUuid: document.documentUuid },
      },
      db,
    )

    return db
      .select({
        id: issues.id,
        title: issues.title,
        description: issues.description,
        documentUuid: issues.documentUuid,
      })
      .from(issues)
      .innerJoin(subquery, eq(subquery.issueId, issues.id))
      .where(
        and(
          tenancyFilter(workspaceId),
          eq(issues.projectId, project.id),
          eq(issues.documentUuid, document.documentUuid),
          ilike(issues.title, `%${title ?? ''}%`),
          ...whereConditions,
        ),
      )
      .orderBy(desc(issues.createdAt))
      .limit(20)
  },
)

async function getCommitIds(
  { workspaceId, commit }: { workspaceId: number; commit: Commit },
  db: any,
) {
  const commitsRepo = new CommitsRepository(workspaceId, db)
  const commits = await commitsRepo.getCommitsHistory({ commit })
  return commits.map((c: { id: number }) => c.id)
}
