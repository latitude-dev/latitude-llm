import { and, eq } from 'drizzle-orm'

import { type Project } from '../../schema/models/types/Project'
import { NotFoundError } from '../../lib/errors'
import { Result, TypedResult } from '../../lib/Result'
import { commits } from '../../schema/models/commits'
import { documentVersions } from '../../schema/models/documentVersions'
import { projects } from '../../schema/models/projects'
import { scopedQuery } from '../scope'
import { tt } from './columns'
import { tenancyFilter } from './filters'

const NOT_FOUND_MSG = 'Project not found'

export const findProjectByDocumentUuid = scopedQuery(
  async function findProjectByDocumentUuid(
    {
      workspaceId,
      documentUuid,
    }: { workspaceId: number; documentUuid: string },
    db,
  ): Promise<TypedResult<Project>> {
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

    if (results.length === 0) {
      return Result.error(new NotFoundError(NOT_FOUND_MSG))
    }

    return Result.ok(results[0]!)
  },
)
