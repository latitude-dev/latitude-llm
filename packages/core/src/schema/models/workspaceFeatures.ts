import { bigint, bigserial, boolean, uniqueIndex } from 'drizzle-orm/pg-core'

import { latitudeSchema } from '../db-schema'
import { timestamps } from '../schemaHelpers'
import { features } from './features'
import { workspaces } from './workspaces'

export const workspaceFeatures = latitudeSchema.table(
  'workspace_features',
  {
    id: bigserial('id', { mode: 'number' }).notNull().primaryKey(),
    workspaceId: bigint('workspace_id', { mode: 'number' })
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    featureId: bigint('feature_id', { mode: 'number' })
      .notNull()
      .references(() => features.id, { onDelete: 'cascade' }),
    enabled: boolean('enabled').notNull().default(false),
    ...timestamps(),
  },
  (table) => ({
    workspaceFeatureUnique: uniqueIndex('workspace_feature_unique').on(
      table.workspaceId,
      table.featureId,
    ),
  }),
)
