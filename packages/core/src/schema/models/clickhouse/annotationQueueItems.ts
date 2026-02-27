export const ANNOTATION_QUEUE_ITEMS_TABLE = 'annotation_queue_items' as const

export type AnnotationQueueItemRow = {
  workspace_id: number
  annotation_queue_id: number
  trace_id: string
  status: string
  assigned_user_id: string
  completed_at: string | null
  completed_by_user_id: string
  created_at: string
  updated_at: string
}

export type AnnotationQueueItemInput = {
  workspace_id: number
  annotation_queue_id: number
  trace_id: string
  status?: string
  assigned_user_id?: string
  completed_at?: string | null
  completed_by_user_id?: string
  created_at?: string
  updated_at?: string
}
