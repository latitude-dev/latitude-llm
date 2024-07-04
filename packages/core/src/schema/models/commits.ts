import { InferSelectModel, relations, sql } from 'drizzle-orm'
import {
  AnyPgColumn,
  bigint,
  bigserial,
  index,
  text,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'

import { latitudeSchema, PromptSnapshot, promptSnapshots } from '..'
import { timestamps } from '../schemaHelpers'

export const commits = latitudeSchema.table(
  'commits',
  {
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
  },
  (table) => ({
    nextCommitIdx: index('commit_next_commit_idx').on(table.nextCommitId),
  }),
)

export const commitRelations = relations(commits, ({ many }) => ({
  snapshots: many(promptSnapshots, { relationName: 'snapshots' }),
}))

export type Commit = InferSelectModel<typeof commits> & {
  snapshots: PromptSnapshot[]
}
