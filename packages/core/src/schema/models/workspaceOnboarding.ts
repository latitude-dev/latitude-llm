import { bigint, bigserial, timestamp } from 'drizzle-orm/pg-core'

import { latitudeSchema } from '../db-schema'
import { timestamps } from '../schemaHelpers'
import { workspaces } from './workspaces'

export const workspaceOnboarding = latitudeSchema.table(
  'workspace_onboarding',
  {
    id: bigserial('id', { mode: 'number' }).notNull().primaryKey(),
    workspaceId: bigint('workspace_id', { mode: 'number' })
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' })
      .unique(),
    completedAt: timestamp('completed_at'),
    ...timestamps(),
  },
)
