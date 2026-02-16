import { and, eq, inArray } from 'drizzle-orm'
import { NotFoundError } from '@latitude-data/constants/errors'
import { database } from '../../client'
import { OkType, Result } from '../../lib/Result'
import { spans } from '../../schema/models/spans'
import { Workspace } from '../../schema/models/types/Workspace'
import { conversationAggregateFields } from './shared'
import { isFeatureEnabledByName } from '../../services/workspaceFeatures/isFeatureEnabledByName'
import { fetchConversation as chFetchConversation } from '../../queries/clickhouse/spans/fetchConversation'

const CLICKHOUSE_SPANS_READ_FLAG = 'clickhouse-spans-read'

export type Conversation = OkType<typeof fetchConversation>

export async function fetchConversation(
  {
    workspace,
    documentLogUuid,
    documentUuid,
  }: {
    workspace: Workspace
    documentLogUuid: string
    documentUuid?: string
  },
  db = database,
) {
  const clickhouseEnabledResult = await isFeatureEnabledByName(
    workspace.id,
    CLICKHOUSE_SPANS_READ_FLAG,
    db,
  )
  const shouldUseClickHouse =
    clickhouseEnabledResult.ok && clickhouseEnabledResult.value

  if (shouldUseClickHouse) {
    const result = await chFetchConversation({
      workspaceId: workspace.id,
      documentLogUuid,
      documentUuid,
    })

    if (!result) {
      return Result.error(new NotFoundError('Conversation not found'))
    }

    return Result.ok(result)
  }

  const conditions = [
    eq(spans.workspaceId, workspace.id),
    eq(spans.documentLogUuid, documentLogUuid),
  ]

  if (documentUuid) {
    conditions.push(eq(spans.documentUuid, documentUuid))
  }

  const traceIdsSubquery = db
    .selectDistinct({ traceId: spans.traceId })
    .from(spans)
    .where(and(...conditions))

  const result = await db
    .select(conversationAggregateFields)
    .from(spans)
    .where(
      and(
        eq(spans.workspaceId, workspace.id),
        inArray(spans.traceId, traceIdsSubquery),
      ),
    )
    .groupBy(spans.documentLogUuid)

  if (result.length === 0) {
    return Result.error(new NotFoundError('Conversation not found'))
  }

  return Result.ok(result[0]!)
}
