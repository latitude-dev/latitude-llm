import {
  bigint,
  bigserial,
  index,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core'

import { latitudeSchema } from '../../db-schema'
import { timestamps } from '../../schemaHelpers'
import { memberships } from '../memberships'
import { workspaces } from '../workspaces'
import { annotationQueues } from './queues'

export type AnnotationQueueItemStatus = 'pending' | 'in_progress' | 'completed'

export const annotationQueueItems = latitudeSchema.table(
  'annotation_queue_items',
  {
    id: bigserial('id', { mode: 'number' }).notNull().primaryKey(),
    annotationQueueId: bigint('annotation_queue_id', { mode: 'number' })
      .notNull()
      .references(() => annotationQueues.id, { onDelete: 'cascade' }),
    workspaceId: bigint('workspace_id', { mode: 'number' })
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    traceId: varchar('trace_id', { length: 32 }).notNull(),
    status: varchar('status', { length: 32 })
      .notNull()
      .$type<AnnotationQueueItemStatus>()
      .default('pending'),
    completedAt: timestamp('completed_at'),
    completedByMembershipId: bigint('completed_by_membership_id', {
      mode: 'number',
    }).references(() => memberships.id, { onDelete: 'set null' }),
    ...timestamps(),
  },
  (table) => [
    index('annotation_queue_items_queue_id_idx').on(table.annotationQueueId),
    index('annotation_queue_items_workspace_id_idx').on(table.workspaceId),
    index('annotation_queue_items_trace_id_idx').on(table.traceId),
    index('annotation_queue_items_status_idx').on(table.status),
    uniqueIndex('annotation_queue_items_queue_trace_unique_idx').on(
      table.annotationQueueId,
      table.traceId,
    ),
  ],
)
