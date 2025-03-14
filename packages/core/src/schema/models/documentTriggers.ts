import { bigint, bigserial, index, jsonb, uuid } from 'drizzle-orm/pg-core'

import { latitudeSchema } from '../db-schema'
import { timestamps } from '../schemaHelpers'
import { projects } from './projects'
import { workspaces } from './workspaces'
import { DocumentTriggerType } from '@latitude-data/constants'
import { DocumentTriggerConfiguration } from '../../services/documentTriggers/helpers/schema'
import { sql } from 'drizzle-orm'

export const documentTriggerTypeEnum = latitudeSchema.enum(
  'document_trigger_types',
  [DocumentTriggerType.Email, DocumentTriggerType.Scheduled],
)

export const documentTriggers = latitudeSchema.table(
  'document_triggers',
  {
    id: bigserial('id', { mode: 'number' }).notNull().primaryKey(),
    uuid: uuid('uuid')
      .notNull()
      .unique()
      .default(sql`gen_random_uuid()`),
    workspaceId: bigint('workspace_id', { mode: 'number' })
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    projectId: bigint('project_id', { mode: 'number' })
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    documentUuid: uuid('document_uuid').notNull(),
    triggerType: documentTriggerTypeEnum('trigger_type').notNull(),
    configuration: jsonb('configuration').$type<DocumentTriggerConfiguration>(),
    ...timestamps(),
  },
  (table) => ({
    projectWorkspaceIdx: index('document_trigger_doc_workspace_idx').on(
      table.workspaceId,
    ),
    // Index for efficient scheduled trigger queries
    scheduledTriggerNextRunTimeIdx: index(
      'scheduled_trigger_next_run_time_idx',
    ).on(sql`(configuration->>'nextRunTime')`),
    // Index on triggerType to quickly find scheduled triggers
    triggerTypeIdx: index('document_trigger_type_idx').on(table.triggerType),
  }),
)
