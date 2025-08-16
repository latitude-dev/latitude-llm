import { and, eq, getTableColumns } from 'drizzle-orm'

import { database } from '../client'
import { commits, documentVersions, projects, workspaces } from '../schema'
import { DocumentVersion, Project, Workspace } from '../browser'
import { Result } from '../lib/Result'
import { LatitudeError, NotFoundError } from '@latitude-data/constants/errors'
import { PromisedResult } from '../lib/Transaction'

export function unsafelyFindProject(projectId: number, db = database) {
  return db.query.projects.findFirst({ where: eq(projects.id, projectId) })
}

export function findProjectFromDocument(
  document: DocumentVersion,
  db = database,
) {
  return db
    .select(getTableColumns(projects))
    .from(projects)
    .innerJoin(commits, eq(commits.projectId, projects.id))
    .innerJoin(documentVersions, eq(documentVersions.commitId, commits.id))
    .where(
      and(
        eq(documentVersions.documentUuid, document.documentUuid),
        eq(commits.id, document.commitId),
      ),
    )
    .then((r) => r[0])
}

export async function unsafelyFindWorkspaceAndProjectFromDocumentUuid(
  documentUuid: string,
  db = database,
): PromisedResult<
  {
    workspace: Workspace
    project: Project
  },
  LatitudeError
> {
  const [result] = await db
    .select({
      workspace: workspaces,
      project: projects,
    })
    .from(workspaces)
    .innerJoin(projects, eq(projects.workspaceId, workspaces.id))
    .innerJoin(commits, eq(commits.projectId, projects.id))
    .innerJoin(documentVersions, eq(documentVersions.commitId, commits.id))
    .where(eq(documentVersions.documentUuid, documentUuid))
    .limit(1)

  if (!result) {
    return Result.error(new NotFoundError('Workspace and project not found'))
  }

  return Result.ok({
    workspace: result.workspace,
    project: result.project,
  })
}
