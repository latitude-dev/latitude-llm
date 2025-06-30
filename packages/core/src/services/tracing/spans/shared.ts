import {
  ApiKey,
  BaseSpanMetadata,
  Otlp,
  SpanAttribute,
  SpanMetadata,
  SpanSpecification,
  SpanStatus,
  SpanType,
  Workspace,
} from '../../../browser'
import { Database } from '../../../client'
import { TypedResult } from '../../../lib/Result'

export type SpanProcessArgs<T extends SpanType = SpanType> = {
  attributes: Record<string, SpanAttribute>
  status: SpanStatus
  scope: Otlp.Scope
  apiKey: ApiKey
  workspace: Workspace
  _type?: T // TODO(tracing): required for type inference, remove this when something in the specification uses the type
}

export type SpanBackendSpecification<T extends SpanType = SpanType> =
  SpanSpecification<T> & {
    process: (
      args: SpanProcessArgs<T>,
      db?: Database,
    ) => Promise<TypedResult<Omit<SpanMetadata<T>, keyof BaseSpanMetadata<T>>>>
  }

export function convertTimestamp(timestamp: string): Date {
  const nanoseconds = BigInt(timestamp)
  const milliseconds = Number(nanoseconds / 1_000_000n)
  return new Date(milliseconds)
}

function capitalize(str: string) {
  if (str.length === 0) return str
  return str.charAt(0).toUpperCase() + str.toLowerCase().slice(1)
}

type CamelCaseable = string | string[] | Record<string, unknown> // prettier-ignore
export function toCamelCase(value: string): string // prettier-ignore
export function toCamelCase(value: string[]): string[] // prettier-ignore
export function toCamelCase(value: Record<string, unknown>): Record<string, unknown> // prettier-ignore
export function toCamelCase(value: CamelCaseable): CamelCaseable {
  if (value === null || value === undefined) {
    return ''
  }

  if (typeof value === 'string') {
    return value
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .replace(/[^A-Za-z0-9]+/g, ' ')
      .trim()
      .split(' ')
      .map((w, i) => (i ? capitalize(w) : w.toLowerCase()))
      .join('')
  }

  if (Array.isArray(value)) {
    return value.map((item) => toCamelCase(item) as string)
  }

  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, value]) => [toCamelCase(key), value]),
    )
  }

  return value
}
