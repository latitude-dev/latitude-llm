import { InferSelectModel, relations, sql } from 'drizzle-orm'
import { bigint, bigserial, index, jsonb, uuid } from 'drizzle-orm/pg-core'

import { latitudeSchema } from '../db-schema'
import { timestamps } from '../schemaHelpers'
import { PromptVersion, promptVersions } from './promptVersions'

export const convos = latitudeSchema.table(
  'convos',
  {
    id: bigserial('id', { mode: 'bigint' }).notNull().primaryKey(),
    uuid: uuid('uuid')
      .notNull()
      .unique()
      .default(sql`gen_random_uuid()`),
    content: jsonb('content'),
    promptVersionId: bigint('prompt_version_id', { mode: 'bigint' })
      .notNull()
      .references(() => promptVersions.id, { onDelete: 'cascade' }),
    ...timestamps(),
  },
  (table) => ({
    promptVersionIdx: index('convo_prompt_version_idx').on(
      table.promptVersionId,
    ),
  }),
)

export const convoRelations = relations(convos, ({ one }) => ({
  promptVersion: one(promptVersions, {
    fields: [convos.promptVersionId],
    references: [promptVersions.id],
  }),
}))

export type Convo = InferSelectModel<typeof convos> & {
  promptVersion: PromptVersion
}
