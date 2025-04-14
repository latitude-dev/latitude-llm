import { sql } from 'drizzle-orm'
import {
  bigint,
  bigserial,
  index,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'

import { latitudeSchema } from '../db-schema'
import { projects } from '../models/projects'
import { users } from '../models/users'
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
    version: bigint('version', { mode: 'number' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'set null' }),
    mergedAt: timestamp('merged_at'),
    deletedAt: timestamp('deleted_at'),
    ...timestamps(),
  },
  (table) => ({
    projectCommitOrderIdx: index('project_commit_order_idx').on(
      table.mergedAt,
      table.projectId,
    ),
    uniqueCommitVersion: uniqueIndex('unique_commit_version').on(
      table.version,
      table.projectId,
    ),
    userIdx: index('user_idx').on(table.userId),
    mergedAtIdx: index('merged_at_idx').on(table.mergedAt),
    projectIdIdx: index('project_id_idx').on(table.projectId),
    deletedAtIdx: index('commits_deleted_at_indx').on(table.deletedAt),
    projectDeletedAtIdx: index('commits_project_deleted_at_idx').on(
      table.projectId,
      table.deletedAt,
    ),
  }),
)
