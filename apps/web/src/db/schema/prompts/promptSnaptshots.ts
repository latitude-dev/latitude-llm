import { InferSelectModel, relations } from 'drizzle-orm'
import { AnyPgColumn, bigint, bigserial, index } from 'drizzle-orm/pg-core'

import {
  Commit,
  commits,
  latitudeSchema,
  PromptVersion,
  promptVersions,
} from '..'
import { timestamps } from '../schemaHelpers'

export const promptSnapshots = latitudeSchema.table(
  'prompt_snapshots',
  {
    id: bigserial('id', { mode: 'bigint' }).notNull().primaryKey(),
    commitId: bigint('commit_id', { mode: 'bigint' })
      .references((): AnyPgColumn => commits.id, { onDelete: 'restrict' })
      .notNull(),
    versionId: bigint('prompt_version_id', { mode: 'bigint' })
      .references((): AnyPgColumn => promptVersions.id, {
        onDelete: 'restrict',
      })
      .notNull(),
    ...timestamps(),
  },
  (prompt) => ({
    commitId: index('prompt_commit_idx').on(prompt.commitId),
  }),
)

export const promptSnapshotsRelations = relations(
  promptSnapshots,
  ({ one }) => ({
    commit: one(commits, {
      fields: [promptSnapshots.commitId],
      references: [commits.id],
    }),
    version: one(promptVersions, {
      fields: [promptSnapshots.versionId],
      references: [promptVersions.id],
    }),
  }),
)

export type PromptSnapshot = InferSelectModel<typeof promptSnapshots> & {
  commit: Commit
  version: PromptVersion
}
