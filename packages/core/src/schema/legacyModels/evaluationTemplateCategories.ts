import { bigserial, varchar } from 'drizzle-orm/pg-core'

import { latitudeSchema } from '../db-schema'
import { timestamps } from '../schemaHelpers'

export const evaluationTemplateCategories = latitudeSchema.table(
  'evaluations_template_categories',
  {
    id: bigserial('id', { mode: 'number' }).notNull().primaryKey(),
    name: varchar('name', { length: 256 }).notNull(),
    ...timestamps(),
  },
)
