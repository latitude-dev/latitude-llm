import { bigserial, numeric, text } from 'drizzle-orm/pg-core'

import { latitudeSchema } from '../db-schema'
import { timestamps } from '../schemaHelpers'

export const evaluationConfigurationNumerical = latitudeSchema.table(
  'evaluation_configuration_numerical',
  {
    id: bigserial('id', { mode: 'number' }).notNull().primaryKey(),
    minValue: numeric('min_value').notNull(),
    maxValue: numeric('max_value').notNull(),
    minValueDescription: text('min_value_description'),
    maxValueDescription: text('max_value_description'),
    ...timestamps(),
  },
)
