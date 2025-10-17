import { type InferSelectModel } from 'drizzle-orm'

import { latteRequests } from '../latteRequests'

export type LatteRequest = InferSelectModel<typeof latteRequests>
