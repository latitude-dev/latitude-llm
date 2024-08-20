import {
  DocumentVersion,
  ProviderApiKey,
  type Commit,
  type Workspace,
} from '$core/browser'
import { database } from '$core/client'
import { NotFoundError, Result, TypedResult } from '$core/lib'
import {
  commits,
  documentVersions,
  projects,
  providerApiKeys,
  workspaces,
} from '$core/schema'
import { eq, getTableColumns } from 'drizzle-orm'

export async function unsafelyFindWorkspace(
  id: number,
  db = database,
): Promise<TypedResult<Workspace, Error>> {
  const workspace = await db.query.workspaces.findFirst({
    where: eq(workspaces.id, id),
  })

  if (!workspace) {
    return Result.error(new NotFoundError('Workspace not found'))
  }

  return Result.ok(workspace)
}

export async function findWorkspaceFromCommit(commit: Commit, db = database) {
  const results = await db
    .select(getTableColumns(workspaces))
    .from(workspaces)
    .innerJoin(projects, eq(projects.workspaceId, workspaces.id))
    .innerJoin(commits, eq(commits.projectId, projects.id))
    .where(eq(commits.id, commit.id))
    .limit(1)

  return results[0]
}

export async function findWorkspaceFromDocument(
  document: DocumentVersion,
  db = database,
) {
  const results = await db
    .select(getTableColumns(workspaces))
    .from(workspaces)
    .innerJoin(projects, eq(projects.workspaceId, workspaces.id))
    .innerJoin(commits, eq(commits.projectId, projects.id))
    .innerJoin(documentVersions, eq(documentVersions.commitId, commits.id))
    .where(eq(documentVersions.id, document.id))
    .limit(1)

  return results[0]
}

export async function findWorkspaceFromProviderApiKey(
  providerApiKey: ProviderApiKey,
  db = database,
) {
  const results = await db
    .select(getTableColumns(workspaces))
    .from(workspaces)
    .innerJoin(providerApiKeys, eq(providerApiKeys.workspaceId, workspaces.id))
    .where(eq(providerApiKeys.id, providerApiKey.id))
    .limit(1)

  return results[0]
}
