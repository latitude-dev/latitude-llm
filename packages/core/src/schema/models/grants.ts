import {
  bigint,
  bigserial,
  index,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'
import { GrantSource, QuotaType } from '../../constants'
import { latitudeSchema } from '../db-schema'
import { timestamps } from '../schemaHelpers'
import { workspaces } from './workspaces'

export const grants = latitudeSchema.table(
  'grants',
  {
    id: bigserial('id', { mode: 'number' }).notNull().primaryKey(),
    uuid: uuid('uuid').notNull().unique().defaultRandom(), // Idempotency key
    workspaceId: bigint('workspace_id', { mode: 'number' })
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    referenceId: varchar('reference_id', { length: 36 }).notNull(),
    source: varchar('source', { length: 32 }).notNull().$type<GrantSource>(),
    type: varchar('type', { length: 32 }).notNull().$type<QuotaType>(),
    amount: bigint('amount', { mode: 'number' }),
    balance: bigint('balance', { mode: 'number' }).notNull(),
    expiresAt: timestamp('expires_at'),
    ...timestamps(),
  },
  (table) => ({
    // idIdx Note: already done with the primary key
    // uuidIdx Note: already done with the unique constraint
    workspaceIdIdx: index('grants_workspace_id_idx').on(table.workspaceId),
    referenceIdIdx: index('grants_reference_id_idx').on(table.referenceId),
    expiresAtIdx: index('grants_expires_at_idx').on(table.expiresAt),
    createdAtIdx: index('grants_created_at_idx').on(table.createdAt),
  }),
)
