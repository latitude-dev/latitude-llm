import { and, desc, eq } from 'drizzle-orm'

import { Commit } from '../../browser'
import { database } from '../../client'
import Repository, { PaginationArgs } from '../../repositories/repository'
import {
  createDocumentLogQuery,
  getCommitFilter,
} from './_createDocumentLogQuery'

export async function computeDocumentLogsWithMetadata(
  {
    workspaceId,
    documentUuid,
    draft,
    pagination,
  }: {
    workspaceId: number
    documentUuid: string
    draft?: Commit
    pagination: PaginationArgs
  },
  db = database,
) {
  const { scope, baseQuery } = createDocumentLogQuery(workspaceId, db)
  const query = baseQuery
    .where(and(eq(scope.documentUuid, documentUuid), getCommitFilter(draft)))
    .orderBy(desc(scope.createdAt))

  return Repository.paginateQuery({ query: query.$dynamic(), ...pagination })
}
