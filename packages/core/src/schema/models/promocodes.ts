import {
  bigserial,
  bigint,
  text,
  varchar,
  timestamp,
} from 'drizzle-orm/pg-core'

import { latitudeSchema } from '../db-schema'
import { timestamps } from '../schemaHelpers'
import { QuotaType } from '../../constants'

export const promocodes = latitudeSchema.table('promocodes', {
  id: bigserial('id', { mode: 'number' }).notNull().primaryKey(),
  code: varchar('code', { length: 32 }).notNull().unique(),
  quotaType: varchar('quota_type', { length: 32 }).notNull().$type<QuotaType>(),
  description: text('description'),
  amount: bigint('amount', { mode: 'number' }).notNull(),
  cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
  ...timestamps(),
})
