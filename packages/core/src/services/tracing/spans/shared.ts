import {
  ApiKey,
  BaseSpanMetadata,
  Otlp,
  SpanAttribute,
  SpanMetadata,
  SpanSpecification,
  SpanType,
  Workspace,
} from '../../../browser'
import { Database } from '../../../client'
import { TypedResult } from '../../../lib/Result'

export type SpanProcessArgs<T extends SpanType = SpanType> = {
  attributes: Record<string, SpanAttribute>
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
