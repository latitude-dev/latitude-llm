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

import {
  DocumentSnapshot,
  documentSnapshots,
  latitudeSchema,
  Workspace,
  workspaces,
} from '..'
import { timestamps } from '../schemaHelpers'

export const commits = latitudeSchema.table(
  'commits',
  {
    id: bigserial('id', { mode: 'number' }).notNull().primaryKey(),
    uuid: uuid('uuid')
      .notNull()
      .unique()
      .default(sql`gen_random_uuid()`),
    nextCommitId: bigint('next_commit_id', { mode: 'number' }).references(
      (): AnyPgColumn => commits.id,
      { onDelete: 'restrict' },
    ),
    title: varchar('title', { length: 256 }),
    description: text('description'),
    workspaceId: bigint('workspace_id', { mode: 'number' })
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    ...timestamps(),
  },
  (table) => ({
    nextCommitIdx: index('commit_next_commit_idx').on(table.nextCommitId),
  }),
)

export const commitRelations = relations(commits, ({ one, many }) => ({
  snapshots: many(documentSnapshots, { relationName: 'snapshots' }),
  workspace: one(workspaces),
}))

export type Commit = InferSelectModel<typeof commits> & {
  snapshots: DocumentSnapshot[]
  workspace: Workspace
}
