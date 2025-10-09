import { bigserial, boolean, text, varchar } from 'drizzle-orm/pg-core'

import { latitudeSchema } from '../db-schema'
import { timestamps } from '../schemaHelpers'

export const features = latitudeSchema.table('features', {
  id: bigserial('id', { mode: 'number' }).notNull().primaryKey(),
  name: varchar('name', { length: 256 }).notNull().unique(),
  description: text('description'),
  enabled: boolean('enabled').notNull().default(false),
  ...timestamps(),
})
