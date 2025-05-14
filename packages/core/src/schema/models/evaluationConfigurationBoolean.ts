import { bigserial, text } from 'drizzle-orm/pg-core'

import { latitudeSchema } from '../db-schema'
import { timestamps } from '../schemaHelpers'

// NOTE: Deprecated
export const evaluationConfigurationBoolean = latitudeSchema.table(
  'evaluation_configuration_boolean',
  {
    id: bigserial('id', { mode: 'number' }).notNull().primaryKey(),
    falseValueDescription: text('false_value_description'),
    trueValueDescription: text('true_value_description'),
    ...timestamps(),
  },
)
