import {
  AnnotationQueueItemStatus,
  ANNOTATION_QUEUE_ITEM_STATUS,
} from '@latitude-data/constants/annotationQueues'
import { clickhouseClient } from '../../../client/clickhouse'
import {
  ANNOTATION_QUEUE_ITEMS_TABLE,
  AnnotationQueueItemRow,
} from '../../../schema/models/clickhouse/annotationQueueItems'
import { scopedQuery } from '../../scope'

export type AnnotationQueueItem = {
  workspaceId: number
  annotationQueueId: number
  traceId: string
  status: AnnotationQueueItemStatus
  assignedUserId: string | null
  completedAt: string | null
  completedByUserId: string | null
  createdAt: string
  updatedAt: string
}

function mapRow(row: AnnotationQueueItemRow): AnnotationQueueItem {
  return {
    workspaceId: row.workspace_id,
    annotationQueueId: row.annotation_queue_id,
    traceId: row.trace_id,
    status: row.status as AnnotationQueueItemStatus,
    assignedUserId: row.assigned_user_id || null,
    completedAt: row.completed_at || null,
    completedByUserId: row.completed_by_user_id || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export const findAnnotationQueueItems = scopedQuery(
  async function findAnnotationQueueItems({
    workspaceId,
    annotationQueueId,
    status,
    from,
    limit = 20,
  }: {
    workspaceId: number
    annotationQueueId: number
    status?: AnnotationQueueItemStatus
    from?: { createdAt: string; traceId: string }
    limit?: number
  }): Promise<{
    items: AnnotationQueueItem[]
    next: { createdAt: string; traceId: string } | null
    count: number
  }> {
    const conditions = [
      `workspace_id = {workspaceId: UInt64}`,
      `annotation_queue_id = {annotationQueueId: UInt64}`,
    ]
    const params: Record<string, unknown> = {
      workspaceId,
      annotationQueueId,
    }

    if (status) {
      conditions.push(`status = {status: String}`)
      params.status = status
    }

    if (from) {
      conditions.push(
        `(created_at, trace_id) < ({cursorCreatedAt: DateTime64(3, 'UTC')}, {cursorTraceId: FixedString(32)})`,
      )
      params.cursorCreatedAt = from.createdAt
      params.cursorTraceId = from.traceId
    }

    const where = `WHERE ${conditions.join(' AND ')}`
    const fetchLimit = limit + 1

    const [itemsResult, countResult] = await Promise.all([
      clickhouseClient().query({
        query: `
          SELECT *
          FROM ${ANNOTATION_QUEUE_ITEMS_TABLE} FINAL
          ${where}
          ORDER BY created_at DESC, trace_id DESC
          LIMIT {fetchLimit: UInt32}
        `,
        format: 'JSONEachRow',
        query_params: { ...params, fetchLimit },
      }),
      clickhouseClient().query({
        query: `
          SELECT count() as count
          FROM ${ANNOTATION_QUEUE_ITEMS_TABLE} FINAL
          WHERE workspace_id = {workspaceId: UInt64}
            AND annotation_queue_id = {annotationQueueId: UInt64}
            ${status ? `AND status = {status: String}` : ''}
        `,
        format: 'JSONEachRow',
        query_params: {
          workspaceId,
          annotationQueueId,
          ...(status ? { status } : {}),
        },
      }),
    ])

    const rows = await itemsResult.json<AnnotationQueueItemRow>()
    const countRows = await countResult.json<{ count: string }>()
    const count = Number(countRows[0]?.count ?? 0)

    const hasMore = rows.length > limit
    const items = hasMore ? rows.slice(0, limit) : rows
    const mapped = items.map(mapRow)

    const last = mapped[mapped.length - 1]
    const next =
      hasMore && last
        ? { createdAt: last.createdAt, traceId: last.traceId }
        : null

    return { items: mapped, next, count }
  },
)

export type AnnotationQueueStatusCounts = Record<
  AnnotationQueueItemStatus,
  number
>

export const countAnnotationQueueItemsByStatus = scopedQuery(
  async function countAnnotationQueueItemsByStatus({
    workspaceId,
    annotationQueueIds,
  }: {
    workspaceId: number
    annotationQueueIds: number[]
  }): Promise<Record<number, AnnotationQueueStatusCounts>> {
    if (annotationQueueIds.length === 0) return {}

    const result = await clickhouseClient().query({
      query: `
        SELECT annotation_queue_id, status, count() as count
        FROM ${ANNOTATION_QUEUE_ITEMS_TABLE} FINAL
        WHERE workspace_id = {workspaceId: UInt64}
          AND annotation_queue_id IN ({queueIds: Array(UInt64)})
        GROUP BY annotation_queue_id, status
      `,
      format: 'JSONEachRow',
      query_params: { workspaceId, queueIds: annotationQueueIds },
    })

    const rows = await result.json<{
      annotation_queue_id: string
      status: string
      count: string
    }>()

    const counts: Record<number, AnnotationQueueStatusCounts> = {}
    for (const id of annotationQueueIds) {
      counts[id] = {
        [ANNOTATION_QUEUE_ITEM_STATUS.pending]: 0,
        [ANNOTATION_QUEUE_ITEM_STATUS.in_progress]: 0,
        [ANNOTATION_QUEUE_ITEM_STATUS.completed]: 0,
      }
    }

    for (const row of rows) {
      const queueId = Number(row.annotation_queue_id)
      if (counts[queueId]) {
        counts[queueId]![row.status as AnnotationQueueItemStatus] = Number(
          row.count,
        )
      }
    }

    return counts
  },
)
