import { bigserial } from 'drizzle-orm/pg-core'

import { latitudeSchema } from '../db-schema'
import { timestamps } from '../schemaHelpers'

export const spanMetadataDefault = latitudeSchema.table(
  'span_metadata_default',
  {
    id: bigserial('id', { mode: 'number' }).notNull().primaryKey(),
    ...timestamps(),
  },
)
