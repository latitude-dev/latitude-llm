import { desc, eq, getTableColumns } from 'drizzle-orm'

import { DocumentVersion, ProviderApiKey, type Commit } from '../browser'
import { database } from '../client'
import {
  commits,
  documentVersions,
  memberships,
  projects,
  providerApiKeys,
  workspaces,
} from '../schema'

export async function unsafelyFindWorkspace(id: number, db = database) {
  return await db.query.workspaces.findFirst({
    where: eq(workspaces.id, id),
  })
}

export async function unsafelyFindWorkspacesFromUser(
  userId: string,
  db = database,
) {
  return await db
    .select(getTableColumns(workspaces))
    .from(workspaces)
    .innerJoin(memberships, eq(workspaces.id, memberships.workspaceId))
    .where(eq(memberships.userId, userId))
    .orderBy(desc(workspaces.createdAt))
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
