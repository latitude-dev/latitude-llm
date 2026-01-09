import { boolean, text, timestamp, varchar, index } from 'drizzle-orm/pg-core'
import { latitudeSchema } from '../db-schema'
import { timestamps } from '../schemaHelpers'
import {
  UserTitle,
  AIUsageStage,
  LatitudeGoal,
} from '@latitude-data/constants/users'

export const users = latitudeSchema.table(
  'users',
  {
    // FIXME: why is this a text column and not a uuid or at least a varchar???
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    name: text('name'),
    email: text('email').notNull().unique(),
    confirmedAt: timestamp('confirmed_at'),
    admin: boolean('admin').notNull().default(false),
    lastSuggestionNotifiedAt: timestamp('last_suggestion_notified_at'),
    devMode: boolean('dev_mode'),
    title: varchar('title', { length: 128 }).$type<UserTitle>(),
    aiUsageStage: varchar('ai_usage_stage', {
      length: 128,
    }).$type<AIUsageStage>(),
    latitudeGoal: varchar('latitude_goal', {
      length: 128,
    }).$type<LatitudeGoal>(),
    latitudeGoalOther: text('latitude_goal_other'),
    ...timestamps(),
  },
  (table) => [index('users_title_idx').on(table.title)],
)
