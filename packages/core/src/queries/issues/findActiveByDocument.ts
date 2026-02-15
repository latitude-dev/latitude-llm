import { ISSUE_GROUP } from '@latitude-data/constants/issues'
import { and, desc, eq } from 'drizzle-orm'

import { CommitsRepository } from '../../repositories/commitsRepository'
import { issues } from '../../schema/models/issues'
import { type Commit } from '../../schema/models/types/Commit'
import { type DocumentVersion } from '../../schema/models/types/DocumentVersion'
import { type Project } from '../../schema/models/types/Project'
import { scopedQuery } from '../scope'
import { getHistogramStatsSubquery } from '../issueHistograms/getHistogramStatsSubquery'
import { tt } from './columns'
import { tenancyFilter } from './filters'
import { buildGroupConditions } from './groupConditions'

export const findActiveIssuesByDocument = scopedQuery(
  async function findActiveIssuesByDocument(
    {
      workspaceId,
      project,
      commit,
      document,
    }: {
      workspaceId: number
      project: Project
      commit: Commit
      document: DocumentVersion
    },
    db,
  ) {
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
      .select(tt)
      .from(issues)
      .innerJoin(subquery, eq(subquery.issueId, issues.id))
      .where(
        and(
          tenancyFilter(workspaceId),
          eq(issues.projectId, project.id),
          eq(issues.documentUuid, document.documentUuid),
          buildGroupConditions(ISSUE_GROUP.active),
        ),
      )
      .orderBy(desc(issues.createdAt), desc(issues.id))
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
