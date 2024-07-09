import { AnyPgColumn, bigint, bigserial, index } from 'drizzle-orm/pg-core'

import { latitudeSchema } from '../db-schema'
import { timestamps } from '../schemaHelpers'
import { commits } from './commits'
import { promptVersions } from './promptVersions'

export const promptSnapshots = latitudeSchema.table(
  'prompt_snapshots',
  {
    id: bigserial('id', { mode: 'bigint' }).notNull().primaryKey(),
    commitId: bigint('commit_id', { mode: 'bigint' })
      .references((): AnyPgColumn => commits.id, { onDelete: 'restrict' })
      .notNull(),
    promptVersionId: bigint('prompt_version_id', { mode: 'bigint' })
      .references((): AnyPgColumn => promptVersions.id, {
        onDelete: 'restrict',
      })
      .notNull(),
    ...timestamps(),
  },
  (prompt) => ({
    commitIdx: index('prompt_commit_idx').on(prompt.commitId),
    promptVersionIdx: index('prompt_snapshot_prompt_version_idx').on(
      prompt.promptVersionId,
    ),
  }),
)
