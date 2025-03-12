import {
  bigint,
  bigserial,
  index,
  integer,
  json,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'

import { latitudeSchema } from '../db-schema'
import { timestamps } from '../schemaHelpers'
import { commits } from './commits'
import { datasets } from './datasets'
import { DocumentType, LinkedDataset, LinkedDatasetRow } from '../../browser'
import { datasetsV2 } from './datasetsV2'

type LinkedDatasetByDatasetId = Record<number, LinkedDataset>
type LinkedDatasetByDatasetIdAndRowId = Record<number, LinkedDatasetRow>

export const documentTypesEnum = latitudeSchema.enum('document_type_enum', [
  DocumentType.Prompt,
  DocumentType.Agent,
])

export const documentVersions = latitudeSchema.table(
  'document_versions',
  {
    id: bigserial('id', { mode: 'number' }).notNull().primaryKey(),
    documentUuid: uuid('document_uuid').notNull().defaultRandom(),
    commitId: bigint('commit_id', { mode: 'number' })
      .notNull()
      .references(() => commits.id, { onDelete: 'cascade' }),
    path: varchar('path').notNull(),
    content: text('content').notNull().default(''),
    resolvedContent: text('resolved_content'),
    contentHash: text('content_hash'),
    promptlVersion: integer('promptl_version').notNull().default(0),
    documentType: documentTypesEnum('document_type')
      .notNull()
      .default(DocumentType.Prompt),
    datasetId: bigint('dataset_id', { mode: 'number' }).references(
      () => datasets.id,
      { onDelete: 'set null' },
    ),
    datasetV2Id: bigint('dataset_v2_id', { mode: 'number' }).references(
      () => datasetsV2.id,
      { onDelete: 'set null' },
    ),
    linkedDataset: json('linked_dataset_by_dataset_id')
      .$type<LinkedDatasetByDatasetId>()
      .default({}),
    linkedDatasetAndRow: json('linked_dataset_by_dataset_id_and_row_id')
      .$type<LinkedDatasetByDatasetIdAndRowId>()
      .default({}),
    deletedAt: timestamp('deleted_at'),
    ...timestamps(),
  },
  (table) => ({
    uniqueDocumentUuidCommitId: uniqueIndex(
      'document_versions_unique_document_uuid_commit_id',
    ).on(table.documentUuid, table.commitId),
    uniquePathCommitIdDeletedAt: uniqueIndex(
      'document_versions_unique_path_commit_id_deleted_at',
    ).on(table.path, table.commitId, table.deletedAt),
    commitIdIdx: index('document_versions_commit_id_idx').on(table.commitId),
    deletedAtIdx: index('document_versions_deleted_at_idx').on(table.deletedAt),
    pathIdx: index('document_versions_path_idx').on(table.path),
  }),
)
