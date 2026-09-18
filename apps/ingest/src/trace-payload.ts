import { parseEnv } from "@platform/env"
import { Effect } from "effect"
import type { Context, MiddlewareHandler } from "hono"
import type { IngestEnv, TracePayload } from "./types.ts"

interface TracePayloadLimits {
  readonly maxPayloadBytes: number
  readonly maxInFlightBytes: number
  readonly maxConcurrentPayloads: number
}

export const DEFAULT_TRACE_PAYLOAD_LIMITS: TracePayloadLimits = {
  maxPayloadBytes: 32 * 1024 * 1024,
  maxInFlightBytes: 64 * 1024 * 1024,
  maxConcurrentPayloads: 16,
}

interface TracePayloadSpan {
  setAttributes(values: Record<string, string | number | boolean>): void
}

export interface TracePayloadRuntime {
  readonly now: () => number
  readonly memoryUsage: () => { readonly rss: number; readonly arrayBuffers: number }
  readonly getActiveSpan: () => TracePayloadSpan | undefined
}

export const createTracePayloadRuntime = (
  getActiveSpan: TracePayloadRuntime["getActiveSpan"] = () => undefined,
): TracePayloadRuntime => ({
  now: () => performance.now(),
  memoryUsage: () => {
    const memory = process.memoryUsage()
    return { rss: memory.rss, arrayBuffers: memory.arrayBuffers }
  },
  getActiveSpan,
})

const defaultRuntime = createTracePayloadRuntime()

const parsePositiveIntegerEnv = (name: string, fallback: number): number => {
  const value = Effect.runSync(parseEnv(name, "number", fallback))
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`)
  }
  return value
}

export const loadTracePayloadLimits = (): TracePayloadLimits => {
  const limits = {
    maxPayloadBytes: parsePositiveIntegerEnv(
      "LAT_INGEST_TRACE_MAX_PAYLOAD_BYTES",
      DEFAULT_TRACE_PAYLOAD_LIMITS.maxPayloadBytes,
    ),
    maxInFlightBytes: parsePositiveIntegerEnv(
      "LAT_INGEST_TRACE_MAX_IN_FLIGHT_BYTES",
      DEFAULT_TRACE_PAYLOAD_LIMITS.maxInFlightBytes,
    ),
    maxConcurrentPayloads: parsePositiveIntegerEnv(
      "LAT_INGEST_TRACE_MAX_CONCURRENT_PAYLOADS",
      DEFAULT_TRACE_PAYLOAD_LIMITS.maxConcurrentPayloads,
    ),
  }

  const minimumInFlightBytes = limits.maxPayloadBytes * 2
  if (!Number.isSafeInteger(minimumInFlightBytes) || limits.maxInFlightBytes < minimumInFlightBytes) {
    throw new Error("LAT_INGEST_TRACE_MAX_IN_FLIGHT_BYTES must be at least twice LAT_INGEST_TRACE_MAX_PAYLOAD_BYTES")
  }

  return limits
}

type ParsedTraceContentLength =
  | { readonly kind: "valid"; readonly declaredBytes?: number }
  | { readonly kind: "invalid" }
  | { readonly kind: "too_large"; readonly declaredBytes: number }

export const parseTraceContentLength = (
  value: string | undefined,
  maxPayloadBytes: number,
): ParsedTraceContentLength => {
  if (value === undefined) return { kind: "valid" }
  if (!/^\d+$/.test(value)) return { kind: "invalid" }

  const declaredBytes = Number(value)
  if (!Number.isSafeInteger(declaredBytes)) return { kind: "invalid" }
  if (declaredBytes > maxPayloadBytes) return { kind: "too_large", declaredBytes }
  return { kind: "valid", declaredBytes }
}

interface TracePayloadLease {
  reserve(bytes: number): boolean
  releaseReserved(bytes: number): void
  release(): void
}

type TracePayloadAdmissionResult =
  | { readonly kind: "acquired"; readonly lease: TracePayloadLease }
  | { readonly kind: "rejected"; readonly limitedBy: "bytes" | "concurrency" }

export class TracePayloadAdmission {
  private activePayloads = 0
  private reservedBytes = 0

  constructor(private readonly limits: TracePayloadLimits) {}

  tryAcquire(bytes: number): TracePayloadAdmissionResult {
    if (this.activePayloads >= this.limits.maxConcurrentPayloads) {
      return { kind: "rejected", limitedBy: "concurrency" }
    }
    if (this.reservedBytes + bytes > this.limits.maxInFlightBytes) {
      return { kind: "rejected", limitedBy: "bytes" }
    }

    this.activePayloads++
    this.reservedBytes += bytes
    let leaseBytes = bytes
    let released = false

    return {
      kind: "acquired",
      lease: {
        reserve: (additionalBytes) => {
          if (released || this.reservedBytes + additionalBytes > this.limits.maxInFlightBytes) return false
          leaseBytes += additionalBytes
          this.reservedBytes += additionalBytes
          return true
        },
        releaseReserved: (releasedBytes) => {
          if (released || releasedBytes > leaseBytes) return
          leaseBytes -= releasedBytes
          this.reservedBytes -= releasedBytes
        },
        release: () => {
          if (released) return
          released = true
          this.activePayloads--
          this.reservedBytes -= leaseBytes
          leaseBytes = 0
        },
      },
    }
  }

  usage() {
    return {
      activePayloads: this.activePayloads,
      reservedBytes: this.reservedBytes,
    }
  }
}

type ReadTracePayloadResult =
  | { readonly kind: "success"; readonly payload: Uint8Array }
  | { readonly kind: "too_large"; readonly observedBytes: number }
  | { readonly kind: "length_mismatch"; readonly observedBytes: number }
  | { readonly kind: "capacity_exceeded"; readonly observedBytes: number }

interface ReadTracePayloadInput {
  readonly stream: ReadableStream<Uint8Array> | null
  readonly declaredBytes?: number | undefined
  readonly maxPayloadBytes: number
  readonly capacity?: Pick<TracePayloadLease, "reserve" | "releaseReserved"> | undefined
}

const cancelReader = async (reader: ReadableStreamDefaultReader<Uint8Array>) => {
  try {
    await reader.cancel()
  } catch {}
}

const emptyStreamResult = (declaredBytes?: number): ReadTracePayloadResult => {
  if (declaredBytes !== undefined && declaredBytes !== 0) {
    return { kind: "length_mismatch", observedBytes: 0 }
  }
  return { kind: "success", payload: new Uint8Array() }
}

type StreamedChunkResult =
  | { readonly kind: "continue" }
  | Extract<ReadTracePayloadResult, { kind: "too_large" | "length_mismatch" | "capacity_exceeded" }>

const applyStreamedChunk = ({
  chunk,
  observedBytes,
  declaredBytes,
  declaredPayload,
  chunks,
  maxPayloadBytes,
  capacity,
}: {
  chunk: Uint8Array
  observedBytes: number
  declaredBytes?: number | undefined
  declaredPayload?: Uint8Array | undefined
  chunks: Uint8Array[]
  maxPayloadBytes: number
  capacity?: Pick<TracePayloadLease, "reserve" | "releaseReserved"> | undefined
}): StreamedChunkResult => {
  if (observedBytes > maxPayloadBytes) {
    return { kind: "too_large", observedBytes }
  }
  if (declaredBytes !== undefined && observedBytes > declaredBytes) {
    return { kind: "length_mismatch", observedBytes }
  }
  if (declaredPayload !== undefined) {
    declaredPayload.set(chunk, observedBytes - chunk.byteLength)
    return { kind: "continue" }
  }
  if (capacity && !capacity.reserve(chunk.byteLength)) {
    return { kind: "capacity_exceeded", observedBytes }
  }
  chunks.push(chunk)
  return { kind: "continue" }
}

const assembleUndeclaredPayload = ({
  chunks,
  observedBytes,
  capacity,
}: {
  chunks: Uint8Array[]
  observedBytes: number
  capacity?: Pick<TracePayloadLease, "reserve" | "releaseReserved"> | undefined
}): ReadTracePayloadResult => {
  if (!observedBytes) return { kind: "success", payload: new Uint8Array() }
  if (capacity && !capacity.reserve(observedBytes)) return { kind: "capacity_exceeded", observedBytes }

  let payload: Uint8Array
  try {
    payload = new Uint8Array(observedBytes)
    let offset = 0
    for (const chunk of chunks) {
      payload.set(chunk, offset)
      offset += chunk.byteLength
    }
  } catch (error) {
    capacity?.releaseReserved(observedBytes)
    throw error
  }
  chunks.length = 0
  capacity?.releaseReserved(observedBytes)
  return { kind: "success", payload }
}

const finalizeTracePayload = ({
  declaredPayload,
  observedBytes,
  chunks,
  capacity,
}: {
  declaredPayload?: Uint8Array | undefined
  observedBytes: number
  chunks: Uint8Array[]
  capacity?: Pick<TracePayloadLease, "reserve" | "releaseReserved"> | undefined
}): ReadTracePayloadResult => {
  if (declaredPayload !== undefined) {
    if (observedBytes !== declaredPayload.byteLength) return { kind: "length_mismatch", observedBytes }
    return { kind: "success", payload: declaredPayload }
  }
  return assembleUndeclaredPayload({ chunks, observedBytes, capacity })
}

export const readTracePayload = async ({
  stream,
  declaredBytes,
  maxPayloadBytes,
  capacity,
}: ReadTracePayloadInput): Promise<ReadTracePayloadResult> => {
  if (!stream) return emptyStreamResult(declaredBytes)

  const reader = stream.getReader()
  const declaredPayload = declaredBytes === undefined ? undefined : new Uint8Array(declaredBytes)
  const chunks: Uint8Array[] = []
  let observedBytes = 0

  try {
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) break

      observedBytes += chunk.value.byteLength
      const applied = applyStreamedChunk({
        chunk: chunk.value,
        observedBytes,
        declaredBytes,
        declaredPayload,
        chunks,
        maxPayloadBytes,
        capacity,
      })
      if (applied.kind !== "continue") {
        await cancelReader(reader)
        return applied
      }
    }
  } finally {
    reader.releaseLock()
  }

  return finalizeTracePayload({ declaredPayload, observedBytes, chunks, capacity })
}

interface TracePayloadProtectionInput {
  readonly limits: TracePayloadLimits
  readonly admission: TracePayloadAdmission
  readonly runtime?: TracePayloadRuntime | undefined
}

const normalizedContentType = (contentType: string): string => {
  const mediaType = contentType.split(";", 1)[0]?.trim().toLowerCase()
  if (mediaType === "application/x-protobuf") return mediaType
  if (mediaType === "application/json") return mediaType
  return "other"
}

const annotatePayloadSpan = ({
  span,
  runtime,
  contentType,
  outcome,
  observedBytes,
  declaredBytes,
  bodyReadDurationMs,
  admissionLimitedBy,
}: {
  span: TracePayloadSpan | undefined
  runtime: TracePayloadRuntime
  contentType: string
  outcome: string
  observedBytes: number
  declaredBytes?: number | undefined
  bodyReadDurationMs: number
  admissionLimitedBy?: string | undefined
}) => {
  if (!span) return
  const memory = runtime.memoryUsage()
  const attributes: Record<string, string | number | boolean> = {
    "latitude.ingest.payload.size_bytes": observedBytes,
    "latitude.ingest.payload.content_type": normalizedContentType(contentType),
    "latitude.ingest.payload.outcome": outcome,
    "latitude.ingest.body_read.duration_ms": bodyReadDurationMs,
    "latitude.ingest.memory.rss_bytes": memory.rss,
    "latitude.ingest.memory.array_buffers_bytes": memory.arrayBuffers,
  }
  if (declaredBytes !== undefined) {
    attributes["latitude.ingest.payload.declared_size_bytes"] = declaredBytes
  }
  if (admissionLimitedBy) {
    attributes["latitude.ingest.payload.admission_limited_by"] = admissionLimitedBy
  }
  span.setAttributes(attributes)
}

const annotateProcessingMemory = (
  span: TracePayloadSpan | undefined,
  runtime: TracePayloadRuntime,
  admission: TracePayloadAdmission,
) => {
  if (!span) return
  const memory = runtime.memoryUsage()
  const usage = admission.usage()
  span.setAttributes({
    "latitude.ingest.memory.after_processing.rss_bytes": memory.rss,
    "latitude.ingest.memory.after_processing.array_buffers_bytes": memory.arrayBuffers,
    "latitude.ingest.payload.active_count": usage.activePayloads,
    "latitude.ingest.payload.reserved_bytes": usage.reservedBytes,
  })
}

type PayloadAnnotation = {
  span: TracePayloadSpan | undefined
  runtime: TracePayloadRuntime
  contentType: string
  declaredBytes?: number | undefined
}

type TimedReadTracePayloadResult = ReadTracePayloadResult & { readonly bodyReadDurationMs: number }

const invalidTraceLengthResponse = (c: Context<IngestEnv>, kind: "invalid" | "too_large") =>
  c.json({ error: "Invalid trace payload length." }, kind === "too_large" ? 413 : 400)

const admissionRejectedResponse = (
  c: Context<IngestEnv>,
  annotation: PayloadAnnotation,
  limitedBy: "bytes" | "concurrency",
) => {
  annotatePayloadSpan({
    ...annotation,
    outcome: "admission_rejected",
    observedBytes: 0,
    bodyReadDurationMs: 0,
    admissionLimitedBy: limitedBy,
  })
  return c.json({ error: "Trace ingestion is temporarily at capacity. Please retry later." }, 503, {
    "Retry-After": "1",
  })
}

const payloadReadFailureResponse = (
  c: Context<IngestEnv>,
  annotation: PayloadAnnotation,
  result: Extract<TimedReadTracePayloadResult, { kind: "too_large" | "length_mismatch" | "capacity_exceeded" }>,
  maxPayloadBytes: number,
) => {
  switch (result.kind) {
    case "too_large":
      annotatePayloadSpan({
        ...annotation,
        outcome: "streamed_too_large",
        observedBytes: result.observedBytes,
        bodyReadDurationMs: result.bodyReadDurationMs,
      })
      return c.json({ error: `Trace payload exceeds the ${maxPayloadBytes}-byte limit.` }, 413)
    case "length_mismatch":
      annotatePayloadSpan({
        ...annotation,
        outcome: "content_length_mismatch",
        observedBytes: result.observedBytes,
        bodyReadDurationMs: result.bodyReadDurationMs,
      })
      return c.json({ error: "Content-Length does not match the trace payload." }, 400)
    case "capacity_exceeded":
      annotatePayloadSpan({
        ...annotation,
        outcome: "stream_admission_rejected",
        observedBytes: result.observedBytes,
        bodyReadDurationMs: result.bodyReadDurationMs,
        admissionLimitedBy: "bytes",
      })
      return c.json({ error: "Trace ingestion is temporarily at capacity. Please retry later." }, 503, {
        "Retry-After": "1",
      })
    default: {
      const _exhaustive: never = result
      return _exhaustive
    }
  }
}

const readTracePayloadOrAnnotate = async ({
  annotation,
  stream,
  declaredBytes,
  maxPayloadBytes,
  capacity,
}: {
  annotation: PayloadAnnotation
  stream: ReadableStream<Uint8Array> | null
  declaredBytes?: number | undefined
  maxPayloadBytes: number
  capacity: Pick<TracePayloadLease, "reserve" | "releaseReserved">
}): Promise<TimedReadTracePayloadResult> => {
  const startedAt = annotation.runtime.now()
  try {
    const result = await readTracePayload({
      stream,
      declaredBytes,
      maxPayloadBytes,
      capacity,
    })
    return { ...result, bodyReadDurationMs: annotation.runtime.now() - startedAt }
  } catch (error) {
    annotatePayloadSpan({
      ...annotation,
      outcome: "read_error",
      observedBytes: 0,
      bodyReadDurationMs: annotation.runtime.now() - startedAt,
    })
    throw error
  }
}

export interface TracePayloadProtection {
  readonly rejectOversizedHeaders: MiddlewareHandler<IngestEnv>
  readonly readPayload: MiddlewareHandler<IngestEnv>
}

export const createTracePayloadProtection = ({
  limits,
  admission,
  runtime = defaultRuntime,
}: TracePayloadProtectionInput): TracePayloadProtection => {
  const rejectOversizedHeaders: MiddlewareHandler<IngestEnv> = async (c, next) => {
    const contentType = c.req.header("Content-Type") ?? "application/json"
    const parsed = parseTraceContentLength(c.req.header("Content-Length"), limits.maxPayloadBytes)

    if (parsed.kind === "invalid") {
      annotatePayloadSpan({
        span: runtime.getActiveSpan(),
        runtime,
        contentType,
        outcome: "invalid_content_length",
        observedBytes: 0,
        bodyReadDurationMs: 0,
      })
      return c.json({ error: "Invalid Content-Length header." }, 400)
    }
    if (parsed.kind === "too_large") {
      annotatePayloadSpan({
        span: runtime.getActiveSpan(),
        runtime,
        contentType,
        outcome: "declared_too_large",
        observedBytes: 0,
        declaredBytes: parsed.declaredBytes,
        bodyReadDurationMs: 0,
      })
      return c.json({ error: `Trace payload exceeds the ${limits.maxPayloadBytes}-byte limit.` }, 413)
    }

    await next()
  }

  const readPayload: MiddlewareHandler<IngestEnv> = async (c, next) => {
    const contentType = c.req.header("Content-Type") ?? "application/json"
    const parsed = parseTraceContentLength(c.req.header("Content-Length"), limits.maxPayloadBytes)
    if (parsed.kind !== "valid") {
      return invalidTraceLengthResponse(c, parsed.kind)
    }

    const span = runtime.getActiveSpan()
    const acquired = admission.tryAcquire(parsed.declaredBytes ?? 0)
    const annotation = {
      span,
      runtime,
      contentType,
      declaredBytes: parsed.declaredBytes,
    }
    if (acquired.kind === "rejected") {
      return admissionRejectedResponse(c, annotation, acquired.limitedBy)
    }

    try {
      const result = await readTracePayloadOrAnnotate({
        annotation,
        stream: c.req.raw.body,
        declaredBytes: parsed.declaredBytes,
        maxPayloadBytes: limits.maxPayloadBytes,
        capacity: acquired.lease,
      })
      if (result.kind !== "success") {
        return payloadReadFailureResponse(c, annotation, result, limits.maxPayloadBytes)
      }

      const tracePayload: TracePayload = {
        payload: result.payload,
        contentType,
      }
      c.set("tracePayload", tracePayload)
      annotatePayloadSpan({
        ...annotation,
        outcome: "accepted",
        observedBytes: result.payload.byteLength,
        bodyReadDurationMs: result.bodyReadDurationMs,
      })
      await next()
    } finally {
      try {
        annotateProcessingMemory(span, runtime, admission)
      } finally {
        acquired.lease.release()
      }
    }
  }

  return { rejectOversizedHeaders, readPayload }
}
