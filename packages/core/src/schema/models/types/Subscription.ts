import { type InferSelectModel } from 'drizzle-orm'

import { subscriptions } from '../subscriptions'

export type Subscription = InferSelectModel<typeof subscriptions>
