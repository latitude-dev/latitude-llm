import { and, eq, sql } from 'drizzle-orm'

import { DEFAULT_PAGINATION_SIZE, Workspace } from '../../browser'
import { database } from '../../client'
import { Result } from '../../lib'
import { documentLogs } from '../../schema'
import { fetchDocumentLogWithMetadata } from './fetchDocumentLogWithMetadata'

export async function fetchDocumentLogWithPosition(
  {
    workspace,
    documentLogUuid,
  }: {
    workspace: Workspace
    documentLogUuid: string | undefined
  },
  db = database,
) {
  const log = await fetchDocumentLogWithMetadata({
    workspaceId: workspace.id,
    documentLogUuid,
  }).then((r) => r.unwrap())

  const targetCreatedAtUTC = new Date(log.createdAt).toISOString()
  const positionResult = await db
    .select({
      count: sql`COUNT(*)`.as('count'),
    })
    .from(documentLogs)
    .where(
      and(
        sql`${documentLogs.createdAt} > ${targetCreatedAtUTC}`,
        eq(documentLogs.documentUuid, log.documentUuid),
      ),
    )

  const position = Number(positionResult[0]!.count)
  const page = Math.ceil(position / DEFAULT_PAGINATION_SIZE)
  return Result.ok({ position, page })
}
