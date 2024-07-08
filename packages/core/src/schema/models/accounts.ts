import { InferSelectModel } from 'drizzle-orm'
import { integer, primaryKey, text } from 'drizzle-orm/pg-core'
import type { AdapterAccountType } from 'next-auth/adapters'

import { latitudeSchema } from '..'
import { timestamps } from '../schemaHelpers'
import { users } from './users'

export const accounts = latitudeSchema.table(
  'accounts',
  {
    userId: text('userId')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: text('type').$type<AdapterAccountType>().notNull(),
    provider: text('provider').notNull(),
    providerAccountId: text('providerAccountId').notNull(),
    refresh_token: text('refresh_token'),
    access_token: text('access_token'),
    expires_at: integer('expires_at'),
    token_type: text('token_type'),
    scope: text('scope'),
    id_token: text('id_token'),
    session_state: text('session_state'),
    ...timestamps(),
  },
  (account) => ({
    compoundKey: primaryKey({
      columns: [account.provider, account.providerAccountId],
    }),
  }),
)

export type Account = InferSelectModel<typeof accounts>
