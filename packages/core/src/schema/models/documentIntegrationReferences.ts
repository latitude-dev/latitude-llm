import { bigint, foreignKey, primaryKey, uuid } from 'drizzle-orm/pg-core'

import { latitudeSchema } from '../db-schema'
import { workspaces } from './workspaces'
import { integrations } from './integrations'
import { documentVersions } from './documentVersions'
import { projects } from './projects'

export const documentIntegrationReferences = latitudeSchema.table(
  'document_integration_references',
  {
    workspaceId: bigint('workspace_id', { mode: 'number' })
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    projectId: bigint('project_id', { mode: 'number' })
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    commitId: bigint('commit_id', { mode: 'number' }).notNull(),
    documentUuid: uuid('document_uuid').notNull(),
    integrationId: bigint('integration_id', { mode: 'number' })
      .notNull()
      .references(() => integrations.id, { onDelete: 'cascade' }),
  },
  (table) => [
    foreignKey({
      name: 'document_integration_references_fk',
      columns: [table.documentUuid, table.commitId],
      foreignColumns: [
        documentVersions.documentUuid,
        documentVersions.commitId,
      ],
    }),
    primaryKey({
      columns: [table.documentUuid, table.commitId, table.integrationId],
    }),
  ],
)
