import { type InferSelectModel } from 'drizzle-orm'

import { memberships } from '../memberships'

export type Membership = InferSelectModel<typeof memberships>
