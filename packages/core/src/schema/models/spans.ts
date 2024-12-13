import {
  bigint,
  bigserial,
  index,
  integer,
  jsonb,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'

import { SpanKind } from '../../constants'
import { latitudeSchema } from '../db-schema'
import { timestamps } from '../schemaHelpers'
import { traces } from './traces'
import { ToolCall } from '@latitude-data/compiler'

// SpanKind describes the relationship between the Span, its parents, and its children in a Trace
export const spanKindsEnum = latitudeSchema.enum('span_kinds', [
  SpanKind.Internal,
  SpanKind.Server,
  SpanKind.Client,
  SpanKind.Producer,
  SpanKind.Consumer,
])

// Represents specific internal span types for more detailed categorization
export const spanInternalTypesEnum = latitudeSchema.enum(
  'span_internal_types',
  ['default', 'generation'],
)

export const spans = latitudeSchema.table(
  'spans',
  {
    id: bigserial('id', { mode: 'number' }).notNull().primaryKey(),

    // OTLP default schema
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

    // Events represent timestamped activities that occurred during the span's lifetime
    // Examples: checkpoints, state changes, or significant operations
    // Each event has a name, timestamp, and optional attributes for additional context
    events: jsonb('events').$type<
      Array<{
        name: string
        timestamp: string
        attributes?: Record<string, string | number | boolean>
      }>
    >(),

    // Links establish connections between spans across different traces
    // Useful for tracking relationships between distributed operations
    // Example: A job processor linking to the trace that created the job
    links: jsonb('links').$type<
      Array<{
        traceId: string
        spanId: string
        attributes?: Record<string, string | number | boolean>
      }>
    >(),

    // Generation metadata
    model: varchar('model'),
    modelParameters: jsonb('model_parameters'),
    input: jsonb('input').$type<unknown>(),
    output: jsonb('output').$type<unknown>(),
    inputTokens: bigint('prompt_tokens', { mode: 'number' }).default(0),
    outputTokens: bigint('completion_tokens', { mode: 'number' }).default(0),
    totalTokens: bigint('total_tokens', { mode: 'number' }).default(0),
    inputCostInMillicents: integer('input_cost_in_millicents').default(0),
    outputCostInMillicents: integer('output_cost_in_millicents').default(0),
    totalCostInMillicents: integer('total_cost_in_millicents').default(0),
    tools: jsonb('tools').$type<ToolCall[]>(),

    // Internal Latitude enum to identify generation spans from other spans
    internalType: spanInternalTypesEnum('internal_type'),
    distinctId: varchar('distinct_id', { length: 256 }),
    metadata:
      jsonb('metadata').$type<Record<string, string | number | boolean>>(),
    documentUuid: uuid('document_uuid'),
    commitUuid: uuid('commit_uuid'),
    parameters: jsonb('parameters').$type<Record<string, unknown>>(),
    ...timestamps(),
  },
  (table) => ({
    traceIdIdx: index('spans_trace_id_idx').on(table.traceId),
    spanIdIdx: index('spans_span_id_idx').on(table.spanId),
    parentSpanIdIdx: index('spans_parent_span_id_idx').on(table.parentSpanId),
    startTimeIdx: index('spans_start_time_idx').on(table.startTime),
  }),
)
