/**
 * OTLP/JSON type definitions matching the OpenTelemetry proto spec.
 * These represent the normalized shape after JSON parsing or protobuf decoding.
 *
 * Field names follow the OTLP/JSON camelCase convention.
 * Numeric strings (timestamps, int64 values) are strings to preserve precision.
 */

export interface OtlpExportTraceServiceRequest {
  readonly resourceSpans?: readonly OtlpResourceSpans[]
}

export interface OtlpResourceSpans {
  readonly resource?: OtlpResource
  readonly scopeSpans?: readonly OtlpScopeSpans[]
  readonly schemaUrl?: string
}

export interface OtlpResource {
  readonly attributes?: readonly OtlpKeyValue[]
  readonly droppedAttributesCount?: number
}

interface OtlpScopeSpans {
  readonly scope?: OtlpInstrumentationScope
  readonly spans?: readonly OtlpSpan[]
  readonly schemaUrl?: string
}

interface OtlpInstrumentationScope {
  readonly name?: string
  readonly version?: string
  readonly attributes?: readonly OtlpKeyValue[]
  readonly droppedAttributesCount?: number
}

export interface OtlpSpan {
  readonly traceId: string
  readonly spanId: string
  readonly traceState?: string
  readonly parentSpanId?: string
  readonly name: string
  readonly kind?: number
  readonly startTimeUnixNano: string
  readonly endTimeUnixNano: string
  readonly attributes?: readonly OtlpKeyValue[]
  readonly droppedAttributesCount?: number
  readonly events?: readonly OtlpEvent[]
  readonly droppedEventsCount?: number
  readonly links?: readonly OtlpLink[]
  readonly droppedLinksCount?: number
  readonly status?: OtlpStatus
  readonly flags?: number
}

export interface OtlpStatus {
  readonly message?: string
  readonly code?: number
}

export interface OtlpEvent {
  readonly timeUnixNano?: string
  readonly name?: string
  readonly attributes?: readonly OtlpKeyValue[]
  readonly droppedAttributesCount?: number
}

export interface OtlpLink {
  readonly traceId?: string
  readonly spanId?: string
  readonly traceState?: string
  readonly attributes?: readonly OtlpKeyValue[]
  readonly droppedAttributesCount?: number
  readonly flags?: number
}

export interface OtlpKeyValue {
  readonly key: string
  readonly value?: OtlpAnyValue
}

export interface OtlpAnyValue {
  readonly stringValue?: string
  readonly boolValue?: boolean
  readonly intValue?: string
  readonly doubleValue?: number
  readonly arrayValue?: OtlpArrayValue
  readonly kvlistValue?: OtlpKeyValueList
  readonly bytesValue?: string
}

export interface OtlpArrayValue {
  readonly values?: readonly OtlpAnyValue[]
}

export interface OtlpKeyValueList {
  readonly values?: readonly OtlpKeyValue[]
}
