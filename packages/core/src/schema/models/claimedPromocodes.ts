import { bigint, bigserial, index, varchar } from 'drizzle-orm/pg-core'

import { latitudeSchema } from '../db-schema'
import { timestamps } from '../schemaHelpers'
import { promocodes } from './promocodes'
import { workspaces } from './workspaces'

export const claimedPromocodes = latitudeSchema.table(
  'claimed_promocodes',
  {
    id: bigserial('id', { mode: 'number' }).notNull().primaryKey(),
    workspaceId: bigint('workspace_id', { mode: 'number' })
      .notNull()
      .references(() => workspaces.id, {
        onDelete: 'cascade',
        onUpdate: 'cascade',
      }),
    code: varchar('code', { length: 32 }).references(() => promocodes.code, {
      onDelete: 'restrict',
      onUpdate: 'cascade',
    }),
    ...timestamps(),
  },
  (table) => ({
    workspaceIdx: index('claimed_promocodes_workspace_id_idx').on(
      table.workspaceId,
    ),
    codeIdx: index('claimed_promocodes_code_idx').on(table.code),
  }),
)
