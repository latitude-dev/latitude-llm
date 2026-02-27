import { insertRows, toClickHouseDateTime } from '../../../clickhouse/insert'
import {
  ANNOTATION_QUEUE_ITEMS_TABLE,
  AnnotationQueueItemInput,
} from '../../../schema/models/clickhouse/annotationQueueItems'
import { AnnotationQueue } from '../../../schema/models/annotationQueues'

function toRow({
  queue,
  traceId,
  createdAt
}: {
  queue: AnnotationQueue
  traceId: string
  createdAt?: string
}): AnnotationQueueItemInput {
  return {
    workspace_id: queue.workspaceId,
    annotation_queue_id: queue.id,
    trace_id: traceId,
    status: 'pending',
    assigned_user_id: '',
    completed_at: null,
    completed_by_user_id: '',
    created_at: createdAt,
    updated_at: createdAt
  }
}

export async function addTracesToQueue({
  queue,
  traceIds,
}: {
  queue: AnnotationQueue
  traceIds: string[]
}) {
  const now = toClickHouseDateTime(new Date())

  const rows = traceIds.map((traceId) => toRow({
    queue,
    traceId,
    createdAt: now
  }))

  return insertRows(ANNOTATION_QUEUE_ITEMS_TABLE, rows)
}
