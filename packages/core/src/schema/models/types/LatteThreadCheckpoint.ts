import { type InferSelectModel } from 'drizzle-orm'

import { latteThreadCheckpoints } from '../latteThreadCheckpoints'

export type LatteThreadCheckpoint = InferSelectModel<
  typeof latteThreadCheckpoints
>
