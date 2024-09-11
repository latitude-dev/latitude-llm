import { and, desc, eq } from 'drizzle-orm'

import { Commit } from '../../browser'
import { database } from '../../client'
import { Result, TypedResult } from '../../lib'
import { DocumentLogWithMetadata } from '../../repositories/documentLogsRepository'
import {
  createDocumentLogQuery,
  getCommitFilter,
} from './_createDocumentLogQuery'

export async function computeDocumentLogsWithMetadata(
  {
    workspaceId,
    documentUuid,
    draft,
  }: {
    workspaceId: number
    documentUuid: string
    draft?: Commit
  },
  db = database,
): Promise<TypedResult<DocumentLogWithMetadata[], Error>> {
  const { scope, baseQuery } = createDocumentLogQuery(workspaceId, db)

  const result = await baseQuery
    .where(and(eq(scope.documentUuid, documentUuid), getCommitFilter(draft)))
    .orderBy(desc(scope.createdAt))

  return Result.ok(result)
}
