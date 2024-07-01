import { InferSelectModel, relations, sql } from 'drizzle-orm'
import {
  AnyPgColumn,
  bigint,
  bigserial,
  text,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'

import { PromptSnapshot, promptSnapshots } from '..'
import { latitudeSchema } from '../db-schema'
import { timestamps } from '../schemaHelpers'

export const commits = latitudeSchema.table('commits', {
  id: bigserial('id', { mode: 'bigint' }).notNull().primaryKey(),
  uuid: uuid('uuid')
    .notNull()
    .unique()
    .default(sql`gen_random_uuid()`),
  nextCommitId: bigint('next_commit_id', { mode: 'bigint' }).references(
    (): AnyPgColumn => commits.id,
    { onDelete: 'restrict' },
  ),
  title: varchar('title', { length: 256 }).notNull(),
  description: text('description'),
  ...timestamps(),
})

export const commitRelations = relations(commits, ({ many }) => ({
  snapshots: many(promptSnapshots),
}))

export type Commit = InferSelectModel<typeof commits> & {
  snapshots: PromptSnapshot[]
}
