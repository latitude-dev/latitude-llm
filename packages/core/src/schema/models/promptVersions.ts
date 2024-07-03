import { InferSelectModel, relations } from 'drizzle-orm'
import {
  bigint,
  bigserial,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'

import { latitudeSchema } from '../db-schema'
import { timestamps } from '../schemaHelpers'
import { commits } from './commits'

export const promptVersions = latitudeSchema.table('prompt_versions', {
  id: bigserial('id', { mode: 'bigint' }).notNull().primaryKey(),
  promptId: uuid('prompt_uuid').notNull(),
  name: varchar('name').notNull(),
  path: varchar('path').unique().notNull(),
  content: text('content').notNull(),
  hash: varchar('hash').notNull(),
  deletedAt: timestamp('deleted_at'),
  commitId: bigint('commit_id', { mode: 'bigint' })
    .notNull()
    .references(() => commits.id),
  ...timestamps(),
})

export const promptVersionRelations = relations(commits, ({ one }) => ({
  commit: one(commits),
}))

export type PromptVersion = InferSelectModel<typeof promptVersions>
