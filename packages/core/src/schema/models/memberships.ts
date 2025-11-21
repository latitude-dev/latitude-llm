import { sql } from 'drizzle-orm'
import {
  bigint,
  bigserial,
  text,
  timestamp,
  index,
  uniqueIndex,
  uuid,
  boolean,
} from 'drizzle-orm/pg-core'

import { latitudeSchema } from '../db-schema'
import { users } from '../models/users'
import { workspaces } from '../models/workspaces'
import { timestamps } from '../schemaHelpers'

export const memberships = latitudeSchema.table(
  'memberships',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    workspaceId: bigint('workspace_id', { mode: 'number' })
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    invitationToken: uuid('invitation_token')
      .notNull()
      .unique()
      .default(sql`gen_random_uuid()`),
    confirmedAt: timestamp('confirmed_at'),
    wantToReceiveWeeklyEmail: boolean('want_to_receive_weekly_email'),
    wantToReceiveEscalatingIssuesEmail: boolean(
      'want_to_receive_escalating_issues_email',
    ),
    ...timestamps(),
  },
  (membership) => [
    uniqueIndex().on(membership.workspaceId, membership.userId),
    uniqueIndex().on(membership.invitationToken),
    index('want_to_receive_weekly_email_idx').on(
      membership.wantToReceiveWeeklyEmail,
    ),
    index('want_to_receive_escalating_issues_email_idx').on(
      membership.wantToReceiveEscalatingIssuesEmail,
    ),
  ],
)
