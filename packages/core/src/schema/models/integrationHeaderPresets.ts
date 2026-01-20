import {
  bigint,
  bigserial,
  index,
  jsonb,
  unique,
  varchar,
} from 'drizzle-orm/pg-core'

import { latitudeSchema } from '../db-schema'
import { timestamps } from '../schemaHelpers'
import { integrations } from './integrations'
import { users } from './users'
import { workspaces } from './workspaces'

export const integrationHeaderPresets = latitudeSchema.table(
  'integration_header_presets',
  {
    id: bigserial('id', { mode: 'number' }).notNull().primaryKey(),
    integrationId: bigint('integration_id', { mode: 'number' })
      .notNull()
      .references(() => integrations.id, { onDelete: 'cascade' }),
    workspaceId: bigint('workspace_id', { mode: 'number' })
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 256 }).notNull(),
    headers: jsonb('headers').$type<Record<string, string>>().notNull(),
    authorId: varchar('author_id')
      .notNull()
      .references(() => users.id),
    ...timestamps(),
  },
  (table) => ({
    integrationIdIdx: index('integration_header_presets_integration_id_idx').on(
      table.integrationId,
    ),
    workspaceIdIdx: index('integration_header_presets_workspace_id_idx').on(
      table.workspaceId,
    ),
    nameUniqueness: unique().on(table.integrationId, table.name),
  }),
)
