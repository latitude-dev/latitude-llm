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
