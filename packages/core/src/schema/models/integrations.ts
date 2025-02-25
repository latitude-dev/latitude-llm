import {
  bigint,
  bigserial,
  index,
  timestamp,
  unique,
  varchar,
  jsonb,
} from 'drizzle-orm/pg-core'

import { latitudeSchema } from '../db-schema'
import { timestamps } from '../schemaHelpers'
import { users } from './users'
import { workspaces } from './workspaces'
import { IntegrationType } from '@latitude-data/constants'
import { CustomMCPConfiguration } from '../../services/integrations/helpers/schema'

export const integrationTypesEnum = latitudeSchema.enum('integration_types', [
  IntegrationType.CustomMCP,
])

export type IntegrationProviderConfig<P extends IntegrationType> =
  P extends IntegrationType.CustomMCP ? CustomMCPConfiguration : never

export const integrations = latitudeSchema.table(
  'integrations',
  {
    id: bigserial('id', { mode: 'number' }).notNull().primaryKey(),
    name: varchar('name').notNull(),
    type: integrationTypesEnum('integration_type')
      .$type<IntegrationType>()
      .notNull(),
    configuration:
      jsonb('configuration').$type<
        IntegrationProviderConfig<IntegrationType.CustomMCP>
      >(),
    workspaceId: bigint('workspace_id', { mode: 'number' })
      .notNull()
      .references(() => workspaces.id),
    authorId: varchar('author_id')
      .notNull()
      .references(() => users.id),
    lastUsedAt: timestamp('last_used_at'),
    deletedAt: timestamp('deleted_at'),
    ...timestamps(),
  },
  (table) => ({
    workspaceIdIdx: index('integrations_workspace_id_idx').on(
      table.workspaceId,
    ),
    nameIdx: index().on(table.name, table.workspaceId, table.deletedAt),
    nameUniqueness: unique()
      .on(table.name, table.workspaceId, table.deletedAt)
      .nullsNotDistinct(),
    userIdIdx: index('integrations_user_id_idx').on(table.authorId),
  }),
)
