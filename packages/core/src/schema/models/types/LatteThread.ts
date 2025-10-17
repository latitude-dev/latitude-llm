import { type InferSelectModel } from 'drizzle-orm'

import { latteThreads } from '../latteThreads'

export type LatteThread = InferSelectModel<typeof latteThreads>
