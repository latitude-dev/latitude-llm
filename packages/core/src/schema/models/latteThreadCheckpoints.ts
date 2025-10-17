import { bigint, bigserial, index, jsonb, uuid } from 'drizzle-orm/pg-core'

import { latitudeSchema } from '../db-schema'
import { latteThreads } from './latteThreads'
import { commits } from './commits'
import { DocumentVersion } from './types/DocumentVersion'

export const latteThreadCheckpoints = latitudeSchema.table(
  'latte_thread_checkpoints',
  {
    id: bigserial('id', { mode: 'number' }).notNull().primaryKey(),
    threadUuid: uuid('thread_uuid')
      .notNull()
      .references(() => latteThreads.uuid, { onDelete: 'cascade' }),
    commitId: bigint('commit_id', { mode: 'number' })
      .notNull()
      .references(() => commits.id, { onDelete: 'cascade' }),
    documentUuid: uuid('document_uuid').notNull(),
    data: jsonb('data').$type<DocumentVersion>(),
  },
  (thread) => ({
    commitIdIndex: index('latte_thread_checkpoints_commit_id_index').on(
      thread.commitId,
    ),
    threadUuidIndex: index('latte_thread_checkpoints_thread_uuid_index').on(
      thread.threadUuid,
    ),
  }),
)
