import { eq, getTableColumns } from 'drizzle-orm'

import { DocumentLog } from '../browser'
import { database } from '../client'
import {
  commits,
  documentLogs,
  documentVersions,
  projects,
  workspaces,
} from '../schema'

export const findWorkspaceFromDocumentLog = async (
  documentLog: DocumentLog,
  db = database,
) => {
  const result = await db
    .select(getTableColumns(workspaces))
    .from(workspaces)
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
