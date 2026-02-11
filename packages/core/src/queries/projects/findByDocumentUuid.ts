import { and, eq } from 'drizzle-orm'

import { type Project } from '../../schema/models/types/Project'
import { commits } from '../../schema/models/commits'
import { documentVersions } from '../../schema/models/documentVersions'
import { projects } from '../../schema/models/projects'
import { scopedQuery } from '../scope'
import { tt } from './columns'
import { tenancyFilter } from './filters'

export const findProjectByDocumentUuid = scopedQuery(
  async function findProjectByDocumentUuid(
    {
      workspaceId,
      documentUuid,
    }: { workspaceId: number; documentUuid: string },
    db,
  ): Promise<Project | undefined> {
    const results = await db
      .select(tt)
      .from(projects)
      .innerJoin(commits, eq(commits.projectId, projects.id))
      .innerJoin(documentVersions, eq(documentVersions.commitId, commits.id))
      .where(
        and(
          tenancyFilter(workspaceId),
          eq(documentVersions.documentUuid, documentUuid),
        ),
      )
      .limit(1)
    return results[0] as Project | undefined
  },
)
