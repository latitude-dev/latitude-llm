import { and, desc, eq } from 'drizzle-orm'

import { Commit } from '../../browser'
import { database } from '../../client'
import {
  createDocumentLogQuery,
  getCommitFilter,
} from './_createDocumentLogQuery'

export function computeDocumentLogsWithMetadataQuery(
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
) {
  const { scope, baseQuery } = createDocumentLogQuery(workspaceId, db)
  return baseQuery
    .where(and(eq(scope.documentUuid, documentUuid), getCommitFilter(draft)))
    .orderBy(desc(scope.createdAt))
}
