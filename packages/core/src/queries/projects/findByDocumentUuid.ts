import { and, eq, getTableColumns } from 'drizzle-orm'

import { type Project } from '../../schema/models/types/Project'
import { NotFoundError } from '../../lib/errors'
import { Result, TypedResult } from '../../lib/Result'
import { commits } from '../../schema/models/commits'
import { documentVersions } from '../../schema/models/documentVersions'
import { projects } from '../../schema/models/projects'
import { type ProjectsScope } from './scope'

const NOT_FOUND_MSG = 'Project not found'

export async function findProjectByDocumentUuid(
  scope: ProjectsScope,
  documentUuid: string,
): Promise<TypedResult<Project>> {
  const tt = getTableColumns(projects)
  const results = await scope.db
    .select(tt)
    .from(projects)
    .innerJoin(commits, eq(commits.projectId, projects.id))
    .innerJoin(documentVersions, eq(documentVersions.commitId, commits.id))
    .where(and(scope.filter, eq(documentVersions.documentUuid, documentUuid)))
    .limit(1)

  if (results.length === 0) {
    return Result.error(new NotFoundError(NOT_FOUND_MSG))
  }

  return Result.ok(results[0]!)
}
