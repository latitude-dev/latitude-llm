import { LatitudeError, NotFoundError } from '@latitude-data/constants/errors'
import { desc, eq } from 'drizzle-orm'
import { database } from '../client'
import { DocumentLog } from '../constants'
import { Result } from '../lib/Result'
import { PromisedResult } from '../lib/Transaction'
import { workspacesDtoColumns } from '../repositories'
import { commits } from '../schema/models/commits'
import { documentVersions } from '../schema/models/documentVersions'
import { memberships } from '../schema/models/memberships'
import { projects } from '../schema/models/projects'
import { providerApiKeys } from '../schema/models/providerApiKeys'
import { subscriptions } from '../schema/models/subscriptions'
import { workspaces } from '../schema/models/workspaces'
import { type Commit } from '../schema/models/types/Commit'
import { type DocumentVersion } from '../schema/models/types/DocumentVersion'
import { type Project } from '../schema/models/types/Project'
import { type ProviderApiKey } from '../schema/models/types/ProviderApiKey'
import { type Workspace } from '../schema/models/types/Workspace'

export async function unsafelyFindWorkspaceByName(name: string, db = database) {
  const result = await db
    .select(workspacesDtoColumns)
    .from(workspaces)
    .innerJoin(
      subscriptions,
      eq(workspaces.currentSubscriptionId, subscriptions.id),
    )
    .where(eq(workspaces.name, name))
    .limit(1)

  return result[0]
}

export async function unsafelyFindWorkspaceByStripeCustomerId(
  stripeCustomerId: string,
  db = database,
) {
  const result = await db
    .select(workspacesDtoColumns)
    .from(workspaces)
    .innerJoin(
      subscriptions,
      eq(workspaces.currentSubscriptionId, subscriptions.id),
    )
    .where(eq(workspaces.stripeCustomerId, stripeCustomerId))
    .limit(1)

  return result[0]
}

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
  userId: string | undefined,
  db = database,
) {
  if (!userId) return []

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

export const findWorkspaceFromDocumentLog = async (
  documentLog: DocumentLog,
  db = database,
) => {
  const result = await db
    .select(workspacesDtoColumns)
    .from(workspaces)
    .innerJoin(
      subscriptions,
      eq(workspaces.currentSubscriptionId, subscriptions.id),
    )
    .innerJoin(projects, eq(projects.workspaceId, workspaces.id))
    .innerJoin(commits, eq(commits.projectId, projects.id))
    .innerJoin(documentVersions, eq(documentVersions.commitId, commits.id))
    .where(eq(documentVersions.documentUuid, documentLog.documentUuid))
    .limit(1)

  return result[0]
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
