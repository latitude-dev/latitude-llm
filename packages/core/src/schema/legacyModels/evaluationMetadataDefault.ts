import { bigserial } from 'drizzle-orm/pg-core'

import { latitudeSchema } from '../db-schema'
import { timestamps } from '../schemaHelpers'

// NOTE: Deprecated
export const evaluationMetadataManual = latitudeSchema.table('evaluation_metadata_manuals', {
  id: bigserial('id', { mode: 'number' }).notNull().primaryKey(),
  ...timestamps(),
})
