import { relations, sql } from 'drizzle-orm'
import {
  bigint,
  bigserial,
  index,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'

import { latitudeSchema, projects, users } from '..'
import { timestamps } from '../schemaHelpers'

export const commits = latitudeSchema.table(
  'commits',
  {
    id: bigserial('id', { mode: 'number' }).notNull().primaryKey(),
    uuid: uuid('uuid')
      .notNull()
      .unique()
      .default(sql`gen_random_uuid()`),
    title: varchar('title', { length: 256 }).notNull(),
    description: text('description'),
    projectId: bigint('project_id', { mode: 'number' })
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'set null' }),
    mergedAt: timestamp('merged_at'),
    ...timestamps(),
  },
  (table) => ({
    projectCommitOrderIdx: index('project_commit_order_idx').on(
      table.mergedAt,
      table.projectId,
    ),
  }),
)

export const commitRelations = relations(commits, ({ one }) => ({
  project: one(projects, {
    fields: [commits.projectId],
    references: [projects.id],
  }),
  user: one(users, {
    fields: [commits.userId],
    references: [users.id],
  }),
}))
