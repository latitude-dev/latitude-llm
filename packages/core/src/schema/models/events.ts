import { bigserial, index, jsonb, varchar } from 'drizzle-orm/pg-core'

import { latitudeSchema } from '../db-schema'
import { timestamps } from '../schemaHelpers'

export const events = latitudeSchema.table(
  'events',
  {
    id: bigserial('id', { mode: 'number' }).notNull().primaryKey(),
    // Dear developer,
    //
    // Ideally we want to scope events by workspace but this requires some
    // extra work that we are not willing to pay right now. Mainly, we need to
    // add workspaceId to all our existing events. Uncomment the following line
    // once you are ready to pay this price.
    //
    // TODO: Uncomment when we are ready
    // workspaceId: bigint('workspace_id', { mode: 'number' })
    //   .notNull()
    //   .references(() => workspaces.id, { onDelete: 'cascade' }),
    type: varchar('type', { length: 256 }).notNull(),
    data: jsonb('data').notNull(),
    ...timestamps(),
  },
  (table) => ({
    // TODO: Uncomment when we are ready
    // eventWorkspaceIdx: index('event_workspace_idx').on(table.workspaceId),
    eventTypeIdx: index('event_type_idx').on(table.type),
  }),
)
