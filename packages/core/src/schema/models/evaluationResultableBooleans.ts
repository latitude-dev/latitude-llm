import { bigserial, boolean } from 'drizzle-orm/pg-core'

import { latitudeSchema } from '../db-schema'
import { timestamps } from '../schemaHelpers'

// NOTE: Deprecated
export const evaluationResultableBooleans = latitudeSchema.table(
  'evaluation_resultable_booleans',
  {
    id: bigserial('id', { mode: 'number' }).notNull().primaryKey(),
    result: boolean('result').notNull(),
    ...timestamps(),
  },
)
