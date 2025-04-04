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
import { ExperimentMetadata, ExperimentResults } from '@latitude-data/constants'
import { datasetsV2 } from './datasetsV2'

export const experiments = latitudeSchema.table(
  'experiments',
  {
    id: bigserial('id', { mode: 'number' }).notNull().primaryKey(),
    name: varchar('name', { length: 256 }),
    commitId: bigint('commit_id', { mode: 'number' })
      .notNull()
      .references(() => commits.id, { onDelete: 'cascade' }),
    documentUuid: uuid('document_uuid').notNull(),
    datasetId: bigint('dataset_id', { mode: 'number' }).references(
      () => datasetsV2.id,
      {
        onDelete: 'restrict',
        onUpdate: 'cascade',
      },
    ),
    threshold: bigint('threshold', { mode: 'number' }).notNull(),
    metadata: jsonb('metadata').$type<ExperimentMetadata>().notNull(),
    results: jsonb('results').$type<ExperimentResults>(),
    startedAt: timestamp('started_at'), // Start time can be null if experiment is still pending
    finishedAt: timestamp('finished_at'), // Finish time can be null if experiment has still not finished
    ...timestamps(),
  },
  (table) => ({
    documentUuidIdx: index('experiments_document_uuid_idx').on(
      table.documentUuid,
    ),
  }),
)
