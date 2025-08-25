import { bigint, bigserial, boolean, index, text } from 'drizzle-orm/pg-core'

import { RewardType } from '../../browser'
import { latitudeSchema } from '../db-schema'
import { timestamps } from '../schemaHelpers'
import { users } from './users'
import { workspaces } from './workspaces'

export const rewardTypesEnum = latitudeSchema.enum('reward_types', [
  RewardType.GithubStar,
  RewardType.Follow,
  RewardType.Post,
  RewardType.GithubIssue,
  RewardType.Referral,
  RewardType.SignupLaunchDay,
])

export const claimedRewards = latitudeSchema.table(
  'claimed_rewards',
  {
    id: bigserial('id', { mode: 'number' }).notNull().primaryKey(),
    workspaceId: bigint('workspace_id', { mode: 'number' })
      .notNull()
      .references(() => workspaces.id),
    userId: text('creator_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    rewardType: rewardTypesEnum('reward_type').notNull(),
    reference: text('reference').notNull(),
    value: bigint('value', { mode: 'number' }).notNull(),
    isValid: boolean('is_valid'),
    ...timestamps(),
  },
  (table) => ({
    workspaceIdIdx: index('claimed_rewards_workspace_id_idx').on(table.workspaceId),
  }),
)
