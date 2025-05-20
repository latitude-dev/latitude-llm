import { bigint, bigserial } from 'drizzle-orm/pg-core'

import { latitudeSchema } from '../db-schema'
import { timestamps } from '../schemaHelpers'

// NOTE: Deprecated
export const evaluationResultableNumbers = latitudeSchema.table(
  'evaluation_resultable_numbers',
  {
    id: bigserial('id', { mode: 'number' }).notNull().primaryKey(),
    result: bigint('result', { mode: 'number' }).notNull(),
    ...timestamps(),
  },
)
