import { type InferSelectModel } from 'drizzle-orm'

import { apiKeys } from '../apiKeys'

export type ApiKey = InferSelectModel<typeof apiKeys>
