import { type Attributes, context as otelContext, SpanKind, SpanStatusCode, trace } from "@opentelemetry/api"
import { GEN_AI_MEMORY_ATTRIBUTES, type MEMORY_OPERATIONS } from "../constants/attributes.ts"
import type { Latitude } from "./init.ts"
import { latitudeAttributesFromContext } from "./tracer.ts"
import type { ContextOptions } from "./types.ts"

type MaybePromise<T> = T | Promise<T>

export type MemoryOperation = (typeof MEMORY_OPERATIONS)[number]

/** A memory record as defined by the OTEL `gen_ai.memory.records` schema: `content` is required. */
export type MemoryRecordInput = {
  readonly content: unknown
  readonly id?: string
  readonly score?: number
  readonly metadata?: Record<string, unknown>
}

export type MemoryRedactInfo = {
  readonly operation: MemoryOperation
  readonly storeId: string
}

export type MemoryTelemetryOptions = {
  readonly latitude: Latitude
  /** Instrumentation scope suffix; defaults to `"memory"` → `so.latitude.instrumentation.memory`. */
  readonly scope?: string
  /** Default `gen_ai.memory.store.id` for every operation; per-call `storeId` overrides it. */
  readonly storeId?: string
  readonly context?: ContextOptions | (() => ContextOptions | undefined)
  /** Send record bodies (`gen_ai.memory.records`). Off by default — opt-in per OTEL and to avoid shipping PII. */
  readonly captureContent?: boolean
  readonly redact?: (records: readonly MemoryRecordInput[], info: MemoryRedactInfo) => readonly MemoryRecordInput[]
}

type MemoryOpBaseOptions = {
  readonly storeId?: string
  readonly count?: number
  readonly captureContent?: boolean
}

type MemoryWriteOptions = MemoryOpBaseOptions & {
  readonly recordId?: string
  readonly records?: readonly MemoryRecordInput[]
}

/** Omit `recordId` to signal a whole-store wipe. */
type MemoryDeleteOptions = MemoryOpBaseOptions & {
  readonly recordId?: string
}

type MemorySearchOptions = MemoryOpBaseOptions & {
  readonly query?: string
  readonly records?: readonly MemoryRecordInput[]
}

type MemoryStoreOptions = {
  readonly storeId?: string
}

type WithExecute<O, T> = O & { readonly execute: () => MaybePromise<T> }

type SearchWithExecute<T> = MemorySearchOptions & {
  readonly execute: () => MaybePromise<T>
  /** Map the search result to the records it returned so they attribute to this span. */
  readonly recordsFromResult?: (result: T) => readonly MemoryRecordInput[]
}

export interface MemoryTelemetry {
  create<T>(options: WithExecute<MemoryWriteOptions, T>): Promise<T>
  create(options?: MemoryWriteOptions): Promise<void>
  update<T>(options: WithExecute<MemoryWriteOptions, T>): Promise<T>
  update(options?: MemoryWriteOptions): Promise<void>
  upsert<T>(options: WithExecute<MemoryWriteOptions, T>): Promise<T>
  upsert(options?: MemoryWriteOptions): Promise<void>
  delete<T>(options: WithExecute<MemoryDeleteOptions, T>): Promise<T>
  delete(options?: MemoryDeleteOptions): Promise<void>
  search<T>(options: SearchWithExecute<T>): Promise<T>
  search(options?: MemorySearchOptions): Promise<void>
  createStore<T>(options: WithExecute<MemoryStoreOptions, T>): Promise<T>
  createStore(options?: MemoryStoreOptions): Promise<void>
  deleteStore<T>(options: WithExecute<MemoryStoreOptions, T>): Promise<T>
  deleteStore(options?: MemoryStoreOptions): Promise<void>
}

function stringifyAttribute(value: unknown): string {
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

type RunParams<T> = {
  readonly operation: MemoryOperation
  readonly storeId?: string
  readonly recordId?: string
  readonly count?: number
  readonly query?: string
  readonly records?: readonly MemoryRecordInput[]
  readonly captureContent?: boolean
  readonly execute?: () => MaybePromise<T>
  readonly recordsFromResult?: (result: T) => readonly MemoryRecordInput[]
}

export function createMemoryTelemetry(options: MemoryTelemetryOptions): MemoryTelemetry {
  const scope = options.scope ?? "memory"
  const defaultStoreId = options.storeId
  const defaultCaptureContent = options.captureContent ?? false
  const redact = options.redact ?? ((records: readonly MemoryRecordInput[]) => records)

  const resolveContext = (): ContextOptions | undefined =>
    typeof options.context === "function" ? options.context() : options.context

  const buildAttributes = (params: {
    operation: MemoryOperation
    storeId: string
    recordId?: string | undefined
    count?: number | undefined
    query?: string | undefined
    records?: readonly MemoryRecordInput[] | undefined
    captureContent: boolean
    context: ContextOptions | undefined
  }): Attributes => {
    const attributes: Attributes = {
      ...latitudeAttributesFromContext(params.context ?? {}),
      [GEN_AI_MEMORY_ATTRIBUTES.operationName]: params.operation,
      [GEN_AI_MEMORY_ATTRIBUTES.storeId]: params.storeId,
    }
    if (params.recordId) attributes[GEN_AI_MEMORY_ATTRIBUTES.recordId] = params.recordId
    const count = params.count ?? params.records?.length
    if (count !== undefined) attributes[GEN_AI_MEMORY_ATTRIBUTES.recordCount] = count
    if (params.query) attributes[GEN_AI_MEMORY_ATTRIBUTES.queryText] = params.query
    if (params.captureContent && params.records && params.records.length > 0) {
      const redacted = redact(params.records, { operation: params.operation, storeId: params.storeId })
      attributes[GEN_AI_MEMORY_ATTRIBUTES.records] = stringifyAttribute(redacted)
    }
    return attributes
  }

  const run = <T>(params: RunParams<T>): Promise<T | undefined> => {
    const context = resolveContext()
    const storeId = params.storeId ?? defaultStoreId ?? ""
    const captureContent = params.captureContent ?? defaultCaptureContent
    const attributes = buildAttributes({
      operation: params.operation,
      storeId,
      recordId: params.recordId,
      count: params.count,
      query: params.query,
      records: params.records,
      captureContent,
      context,
    })
    const parentContext = otelContext.active()
    const span = options.latitude
      .getTracer(scope)
      .startSpan(params.operation, { kind: SpanKind.CLIENT, attributes }, parentContext)

    const execute = params.execute
    if (!execute) {
      span.end()
      return Promise.resolve(undefined)
    }

    return otelContext.with(trace.setSpan(parentContext, span), async () => {
      try {
        const result = await execute()
        if (params.recordsFromResult) {
          const derived = params.recordsFromResult(result)
          if (derived.length > 0) {
            span.setAttributes(
              buildAttributes({
                operation: params.operation,
                storeId,
                count: params.count ?? derived.length,
                query: params.query,
                records: derived,
                captureContent,
                context,
              }),
            )
          }
        }
        return result
      } catch (error) {
        span.recordException(error as Error)
        span.setStatus({ code: SpanStatusCode.ERROR, message: error instanceof Error ? error.message : String(error) })
        throw error
      } finally {
        span.end()
      }
    })
  }

  function create<T>(options: WithExecute<MemoryWriteOptions, T>): Promise<T>
  function create(options?: MemoryWriteOptions): Promise<void>
  function create<T>(opts: MemoryWriteOptions & { execute?: () => MaybePromise<T> } = {}): Promise<unknown> {
    return run<T>({ operation: "create_memory", ...opts })
  }

  function update<T>(options: WithExecute<MemoryWriteOptions, T>): Promise<T>
  function update(options?: MemoryWriteOptions): Promise<void>
  function update<T>(opts: MemoryWriteOptions & { execute?: () => MaybePromise<T> } = {}): Promise<unknown> {
    return run<T>({ operation: "update_memory", ...opts })
  }

  function upsert<T>(options: WithExecute<MemoryWriteOptions, T>): Promise<T>
  function upsert(options?: MemoryWriteOptions): Promise<void>
  function upsert<T>(opts: MemoryWriteOptions & { execute?: () => MaybePromise<T> } = {}): Promise<unknown> {
    return run<T>({ operation: "upsert_memory", ...opts })
  }

  function deleteOp<T>(options: WithExecute<MemoryDeleteOptions, T>): Promise<T>
  function deleteOp(options?: MemoryDeleteOptions): Promise<void>
  function deleteOp<T>(opts: MemoryDeleteOptions & { execute?: () => MaybePromise<T> } = {}): Promise<unknown> {
    return run<T>({ operation: "delete_memory", ...opts })
  }

  function search<T>(options: SearchWithExecute<T>): Promise<T>
  function search(options?: MemorySearchOptions): Promise<void>
  function search<T>(opts: SearchWithExecute<T> | MemorySearchOptions = {}): Promise<unknown> {
    return run<T>({ operation: "search_memory", ...opts } as RunParams<T>)
  }

  function createStore<T>(options: WithExecute<MemoryStoreOptions, T>): Promise<T>
  function createStore(options?: MemoryStoreOptions): Promise<void>
  function createStore<T>(opts: MemoryStoreOptions & { execute?: () => MaybePromise<T> } = {}): Promise<unknown> {
    return run<T>({ operation: "create_memory_store", ...opts })
  }

  function deleteStore<T>(options: WithExecute<MemoryStoreOptions, T>): Promise<T>
  function deleteStore(options?: MemoryStoreOptions): Promise<void>
  function deleteStore<T>(opts: MemoryStoreOptions & { execute?: () => MaybePromise<T> } = {}): Promise<unknown> {
    return run<T>({ operation: "delete_memory_store", ...opts })
  }

  return { create, update, upsert, delete: deleteOp, search, createStore, deleteStore }
}
