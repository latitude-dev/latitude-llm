import { bigserial, text } from 'drizzle-orm/pg-core'

import { latitudeSchema } from '../db-schema'
import { timestamps } from '../schemaHelpers'

// NOTE: Deprecated
export const evaluationResultableTexts = latitudeSchema.table('evaluation_resultable_texts', {
  id: bigserial('id', { mode: 'number' }).notNull().primaryKey(),
  result: text('result').notNull(),
  ...timestamps(),
})
