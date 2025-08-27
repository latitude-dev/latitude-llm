import {
  bigint,
  bigserial,
  boolean,
  index,
  jsonb,
  timestamp,
  uuid,
  uniqueIndex,
} from 'drizzle-orm/pg-core'

import { latitudeSchema } from '../db-schema'
import { timestamps } from '../schemaHelpers'
import { projects } from './projects'
import { workspaces } from './workspaces'
import {
  DocumentTriggerStatus,
  DocumentTriggerType,
} from '@latitude-data/constants'
import {
  DocumentTriggerConfiguration,
  DocumentTriggerDeploymentSettings,
} from '@latitude-data/constants/documentTriggers'
import { sql } from 'drizzle-orm'
import { commits } from './commits'

export const documentTriggerTypeEnum = latitudeSchema.enum(
  'document_trigger_types',
  Object.values(DocumentTriggerType) as [string, ...string[]],
)

export const documentTriggerStatusEnum = latitudeSchema.enum(
  'document_trigger_status',
  Object.values(DocumentTriggerStatus) as [string, ...string[]],
)

export const documentTriggers = latitudeSchema.table(
  'document_triggers',
  {
    id: bigserial('id', { mode: 'number' }).notNull().primaryKey(),
    uuid: uuid('uuid')
      .notNull()
      .default(sql`gen_random_uuid()`),
    workspaceId: bigint('workspace_id', { mode: 'number' })
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    projectId: bigint('project_id', { mode: 'number' })
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    commitId: bigint('commit_id', { mode: 'number' })
      .notNull()
      .references(() => commits.id, { onDelete: 'cascade' }),
    documentUuid: uuid('document_uuid').notNull(),
    triggerStatus: documentTriggerStatusEnum('trigger_status')
      .notNull()
      .default(DocumentTriggerStatus.Pending),
    triggerType: documentTriggerTypeEnum('trigger_type').notNull(),
    configuration: jsonb('configuration')
      .$type<DocumentTriggerConfiguration<DocumentTriggerType>>()
      .notNull(),
    deploymentSettings: jsonb(
      'deployment_settings',
    ).$type<DocumentTriggerDeploymentSettings<DocumentTriggerType> | null>(), // When NULL, the trigger is not deployed
    enabled: boolean('enabled').notNull().default(false), // Indicates whether the trigger is enabled and should run the prompt with incoming events
    deletedAt: timestamp('deleted_at'),
    ...timestamps(),
  },
  (table) => ({
    projectWorkspaceIdx: index('document_trigger_doc_workspace_idx').on(
      table.workspaceId,
    ),
    // Ensure we can upsert by (uuid, commit_id)
    documentTriggersUuidCommitUnique: uniqueIndex(
      'document_triggers_uuid_commit_unique',
    ).on(table.uuid, table.commitId),
    // Index for efficient scheduled trigger queries
    scheduledTriggerNextRunTimeIdx: index(
      'scheduled_trigger_next_run_time_idx',
    ).on(sql`(deployment_settings->>'nextRunTime')`),
    // Index on triggerType to quickly find scheduled triggers
    triggerTypeIdx: index('document_trigger_type_idx').on(table.triggerType),
  }),
)
