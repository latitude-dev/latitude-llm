import {
  bigint,
  bigserial,
  index,
  jsonb,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'

import { latitudeSchema } from '../db-schema'
import { timestamps } from '../schemaHelpers'
import { commits } from './commits'
import { ExperimentMetadata } from '@latitude-data/constants'
import { datasetsV2 } from './datasetsV2'
import { sql } from 'drizzle-orm'

export const experiments = latitudeSchema.table(
  'experiments',
  {
    id: bigserial('id', { mode: 'number' }).notNull().primaryKey(),
    name: varchar('name', { length: 256 }).notNull(),
    commitId: bigint('commit_id', { mode: 'number' })
      .notNull()
      .references(() => commits.id, { onDelete: 'cascade' }),
    documentUuid: uuid('document_uuid').notNull(),
    evaluationUuids: uuid('evaluation_uuids')
      .array()
      .notNull()
      .default(sql`'{}'::uuid[]`),
    datasetId: bigint('dataset_id', { mode: 'number' }).references(
      () => datasetsV2.id,
      {
        onDelete: 'restrict',
        onUpdate: 'cascade',
      },
    ),
    metadata: jsonb('metadata').$type<ExperimentMetadata>().notNull(),
    startedAt: timestamp('started_at'), // Start time can be null if experiment is still pending
    finishedAt: timestamp('finished_at'), // Finish time can be null if experiment has still not finished
    ...timestamps(),
  },
  (table) => ({
    documentUuidIdx: index('experiments_document_uuid_idx').on(
      table.documentUuid,
    ),
    documentCommitIdx: index('experiments_document_commit_idx').on(
      table.commitId,
      table.documentUuid,
    ),
    datasetIdIdx: index('experiments_dataset_id_idx').on(table.datasetId),
  }),
)
