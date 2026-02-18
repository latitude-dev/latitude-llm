import { bigint, bigserial, index, uniqueIndex } from 'drizzle-orm/pg-core'

import { latitudeSchema } from '../../db-schema'
import { timestamps } from '../../schemaHelpers'
import { memberships } from '../memberships'
import { annotationQueues } from './queues'

export const annotationQueueMembers = latitudeSchema.table(
  'annotation_queue_members',
  {
    id: bigserial('id', { mode: 'number' }).notNull().primaryKey(),
    annotationQueueId: bigint('annotation_queue_id', { mode: 'number' })
      .notNull()
      .references(() => annotationQueues.id, { onDelete: 'cascade' }),
    membershipId: bigint('membership_id', { mode: 'number' })
      .notNull()
      .references(() => memberships.id, { onDelete: 'cascade' }),
    ...timestamps(),
  },
  (table) => [
    index('annotation_queue_members_queue_id_idx').on(table.annotationQueueId),
    index('annotation_queue_members_membership_id_idx').on(table.membershipId),
    uniqueIndex('annotation_queue_members_unique_idx').on(
      table.annotationQueueId,
      table.membershipId,
    ),
  ],
)
