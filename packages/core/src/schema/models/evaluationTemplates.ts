import { bigserial, text, varchar } from 'drizzle-orm/pg-core'

import { latitudeSchema } from '..'
import { timestamps } from '../schemaHelpers'

export const evaluationTemplates = latitudeSchema.table(
  'evaluations_templates',
  {
    id: bigserial('id', { mode: 'number' }).notNull().primaryKey(),
    name: varchar('name', { length: 256 }).notNull(),
    description: text('description').notNull(),
    prompt: text('prompt').notNull(),
    ...timestamps(),
  },
)
