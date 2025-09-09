import { bigserial, bigint, text } from 'drizzle-orm/pg-core'

import { latitudeSchema } from '../db-schema'
import { timestamps } from '../schemaHelpers'
import { QuotaType } from '../../constants'

export const rewardTypesEnum = latitudeSchema.enum('quota_types', [
  QuotaType.Seats,
  QuotaType.Runs,
  QuotaType.Credits,
])

export const promocodes = latitudeSchema.table('promocodes', {
  id: bigserial('id', { mode: 'number' }).notNull().primaryKey(),
  code: text('code').notNull().unique(),
  quotaType: rewardTypesEnum('quota_type').notNull(),
  description: text('description'),
  amount: bigint('amount', { mode: 'number' }).notNull(),
  ...timestamps(),
})
