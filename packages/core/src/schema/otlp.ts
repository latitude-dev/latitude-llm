export interface Span {
  traceId: string
  spanId: string
  parentSpanId?: string
  name: string
  kind: SpanKind
  startTimeUnixNano: string
  endTimeUnixNano: string
  status?: Status
  events?: Event[]
  links?: Link[]
  attributes?: Attribute[]
}

export interface Scope {
  name: string
  version?: string
  attributes?: Attribute[]
}

export interface Resource {
  attributes: Attribute[]
}

export interface ResourceSpan {
  resource: Resource
  scopeSpans: ScopeSpan[]
}

export interface ScopeSpan {
  scope: Scope
  spans: Span[]
}

export interface Attribute {
  key: string
  value: AttributeValue
}

export type AttributeValue = {
  stringValue?: string
  intValue?: number
  boolValue?: boolean
  arrayValue?: { values: AttributeValue[] }
  kvlistValue?: { values: Attribute[] }
}

export interface Status {
  code: StatusCode
  message?: string
}

export enum StatusCode {
  Unset = 0,
  Ok = 1,
  Error = 2,
}

export interface Event {
  timeUnixNano: string
  name: string
  attributes?: Attribute[]
}

export interface Link {
  traceId: string
  spanId: string
  traceState?: string
  attributes?: Attribute[]
}

export enum SpanKind {
  Internal = 0,
  Server = 1,
  Client = 2,
  Producer = 3,
  Consumer = 4,
}
