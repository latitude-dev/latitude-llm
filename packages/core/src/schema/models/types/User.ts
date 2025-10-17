import { type InferSelectModel } from 'drizzle-orm'

import { users } from '../users'

export type User = InferSelectModel<typeof users>
