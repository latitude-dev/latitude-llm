import { bigint, primaryKey, text } from 'drizzle-orm/pg-core'

import { latitudeSchema } from '../db-schema'
import { users } from '../models/users'
import { workspaces } from '../models/workspaces'
import { timestamps } from '../schemaHelpers'

export const memberships = latitudeSchema.table(
  'memberships',
  {
    workspaceId: bigint('workspace_id', { mode: 'number' })
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    ...timestamps(),
  },
  (membership) => ({
    compoundKey: primaryKey({
      columns: [membership.workspaceId, membership.userId],
    }),
  }),
)
