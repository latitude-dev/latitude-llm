import { type InferSelectModel } from 'drizzle-orm'

import { commits } from '../commits'

export type Commit = InferSelectModel<typeof commits>
