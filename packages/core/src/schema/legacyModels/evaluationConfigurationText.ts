import { bigserial, text } from 'drizzle-orm/pg-core'

import { latitudeSchema } from '../db-schema'
import { timestamps } from '../schemaHelpers'

// NOTE: Deprecated
export const evaluationConfigurationText = latitudeSchema.table('evaluation_configuration_text', {
  id: bigserial('id', { mode: 'number' }).notNull().primaryKey(),
  valueDescription: text('value_description'),
  ...timestamps(),
})
