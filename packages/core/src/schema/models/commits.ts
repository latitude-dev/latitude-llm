import { sql } from 'drizzle-orm'
import {
  AnyPgColumn,
  bigint,
  bigserial,
  index,
  text,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'

import { latitudeSchema } from '../db-schema'
import { timestamps } from '../schemaHelpers'
import { users } from './users'
import { workspaces } from './workspaces'

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
    authorId: text('author_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    workspaceId: bigserial('workspace_id', { mode: 'bigint' })
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    ...timestamps(),
  },
  (table) => ({
    nextCommitIdx: index('commit_next_commit_idx').on(table.nextCommitId),
  }),
)
