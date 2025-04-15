import { and, eq } from 'drizzle-orm'

import { DocumentLog } from '../browser'
import { database } from '../client'
import { workspacesDtoColumns } from '../repositories'
import {
  commits,
  documentLogs,
  documentVersions,
  projects,
  subscriptions,
  workspaces,
} from '../schema'

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

export const unsafelyFindDocumentLogByUuid = async (
  documentLogUuid: string,
  db = database,
) => {
  const result = await db
    .select()
    .from(documentLogs)
    .where(eq(documentLogs.uuid, documentLogUuid))
    .limit(1)

  return result[0]
}

export async function findDocumentFromLog(log: DocumentLog) {
  return database
    .select()
    .from(documentVersions)
    .where(
      and(
        eq(documentVersions.documentUuid, log.documentUuid),
        eq(documentVersions.commitId, log.commitId),
      ),
    )
    .limit(1)
    .then(([document]) => document)
}
