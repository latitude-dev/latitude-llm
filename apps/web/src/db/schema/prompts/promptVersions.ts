import { InferSelectModel } from 'drizzle-orm'
import { bigserial, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core'

import { latitudeSchema } from '../db-schema'
import { timestamps } from '../schemaHelpers'

export const promptVersions = latitudeSchema.table('prompt_versions', {
  id: bigserial('id', { mode: 'bigint' }).notNull().primaryKey(),
  promptId: uuid('prompt_uuid').notNull(),
  name: varchar('name').notNull(),
  path: varchar('path').unique().notNull(),
  content: text('content').notNull(),
  hash: varchar('hash').notNull(),
  deletedAt: timestamp('deleted_at'),
  ...timestamps(),
})

export type PromptVersion = InferSelectModel<typeof promptVersions>
