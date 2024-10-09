import { desc, eq } from 'drizzle-orm'

import { DocumentVersion, ProviderApiKey, type Commit } from '../browser'
import { database } from '../client'
import { workspacesDtoColumns } from '../repositories'
import {
  commits,
  documentVersions,
  memberships,
  projects,
  providerApiKeys,
  subscriptions,
  workspaces,
} from '../schema'

export async function unsafelyFindWorkspace(id: number, db = database) {
  const result = await db
    .select(workspacesDtoColumns)
    .from(workspaces)
    .innerJoin(
      subscriptions,
      eq(workspaces.currentSubscriptionId, subscriptions.id),
    )
    .where(eq(workspaces.id, id))
    .limit(1)

  return result[0]
}

export async function unsafelyFindWorkspacesFromUser(
  userId: string,
  db = database,
) {
  return await db
    .select(workspacesDtoColumns)
    .from(workspaces)
    .innerJoin(
      subscriptions,
      eq(workspaces.currentSubscriptionId, subscriptions.id),
    )
    .innerJoin(memberships, eq(workspaces.id, memberships.workspaceId))
    .where(eq(memberships.userId, userId))
    .orderBy(desc(workspaces.createdAt))
}

export async function findWorkspaceFromCommit(commit: Commit, db = database) {
  const results = await db
    .select(workspacesDtoColumns)
    .from(workspaces)
    .innerJoin(
      subscriptions,
      eq(workspaces.currentSubscriptionId, subscriptions.id),
    )
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
    .select(workspacesDtoColumns)
    .from(workspaces)
    .innerJoin(
      subscriptions,
      eq(workspaces.currentSubscriptionId, subscriptions.id),
    )
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
    .select(workspacesDtoColumns)
    .from(workspaces)
    .innerJoin(
      subscriptions,
      eq(workspaces.currentSubscriptionId, subscriptions.id),
    )
    .innerJoin(providerApiKeys, eq(providerApiKeys.workspaceId, workspaces.id))
    .where(eq(providerApiKeys.id, providerApiKey.id))
    .limit(1)

  return results[0]
}
