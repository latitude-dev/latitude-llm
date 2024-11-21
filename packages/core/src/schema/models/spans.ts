import {
  bigint,
  bigserial,
  index,
  jsonb,
  text,
  timestamp,
  varchar,
} from 'drizzle-orm/pg-core'

import { latitudeSchema } from '../db-schema'
import { timestamps } from '../schemaHelpers'
import { traces } from './traces'

export const spanKindsEnum = latitudeSchema.enum('span_kinds', [
  'internal',
  'server',
  'client',
  'producer',
  'consumer',
])

export const spanMetadataTypesEnum = latitudeSchema.enum(
  'span_metadata_types',
  ['default', 'generation'],
)

export const spans = latitudeSchema.table(
  'spans',
  {
    id: bigserial('id', { mode: 'number' }).notNull().primaryKey(),
    traceId: varchar('trace_id', { length: 32 })
      .notNull()
      .references(() => traces.traceId, { onDelete: 'cascade' }),
    spanId: varchar('span_id', { length: 16 }).notNull().unique(),
    parentSpanId: varchar('parent_span_id', { length: 16 }),
    name: varchar('name', { length: 256 }).notNull(),
    kind: spanKindsEnum('kind').notNull(),
    startTime: timestamp('start_time').notNull(),
    endTime: timestamp('end_time'),
    attributes:
      jsonb('attributes').$type<Record<string, string | number | boolean>>(),
    status: varchar('status', { length: 64 }),
    statusMessage: text('status_message'),
    events: jsonb('events').$type<
      Array<{
        name: string
        timestamp: string
        attributes?: Record<string, string | number | boolean>
      }>
    >(),
    links: jsonb('links').$type<
      Array<{
        traceId: string
        spanId: string
        attributes?: Record<string, string | number | boolean>
      }>
    >(),
    metadataType: spanMetadataTypesEnum('metadata_type').notNull(),
    metadataId: bigint('metadata_id', { mode: 'number' }).notNull(),
    ...timestamps(),
  },
  (table) => ({
    traceIdIdx: index('spans_trace_id_idx').on(table.traceId),
    spanIdIdx: index('spans_span_id_idx').on(table.spanId),
    parentSpanIdIdx: index('spans_parent_span_id_idx').on(table.parentSpanId),
    startTimeIdx: index('spans_start_time_idx').on(table.startTime),
    metadataIdx: index('spans_metadata_idx').on(
      table.metadataId,
      table.metadataType,
    ),
  }),
)
