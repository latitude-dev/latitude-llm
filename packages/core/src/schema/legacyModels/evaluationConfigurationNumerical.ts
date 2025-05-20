import { bigint, bigserial, text } from 'drizzle-orm/pg-core'

import { latitudeSchema } from '../db-schema'
import { timestamps } from '../schemaHelpers'

// NOTE: Deprecated
export const evaluationConfigurationNumerical = latitudeSchema.table(
  'evaluation_configuration_numerical',
  {
    id: bigserial('id', { mode: 'number' }).notNull().primaryKey(),
    minValue: bigint('min_value', { mode: 'number' }).notNull(),
    maxValue: bigint('max_value', { mode: 'number' }).notNull(),
    minValueDescription: text('min_value_description'),
    maxValueDescription: text('max_value_description'),
    ...timestamps(),
  },
)
