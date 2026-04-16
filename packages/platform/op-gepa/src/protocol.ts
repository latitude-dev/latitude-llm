import { type ZodType, z } from "zod"

export const JSON_RPC_VERSION = "2.0"

export const jsonRpcRequestSchema = z.object({
  jsonrpc: z.literal(JSON_RPC_VERSION).default(JSON_RPC_VERSION),
  method: z.string(),
  params: z.record(z.string(), z.unknown()).default({}),
  id: z.union([z.number(), z.string(), z.null()]),
})

export const jsonRpcErrorSchema = z.object({
  code: z.number(),
  message: z.string(),
  data: z.unknown().optional(),
})

export const jsonRpcResponseSchema = z.object({
  jsonrpc: z.literal(JSON_RPC_VERSION).default(JSON_RPC_VERSION),
  result: z.unknown().optional(),
  error: jsonRpcErrorSchema.optional(),
  id: z.union([z.number(), z.string(), z.null()]),
})

export type JsonRpcRequest = z.infer<typeof jsonRpcRequestSchema>
export type JsonRpcError = z.infer<typeof jsonRpcErrorSchema>
export type JsonRpcResponse = z.infer<typeof jsonRpcResponseSchema>
export type JsonRpcMessage = JsonRpcRequest | JsonRpcResponse
type JsonRpcId = JsonRpcRequest["id"]

export const JsonRpcErrorCode = {
  parseError: -32700,
  invalidRequest: -32600,
  methodNotFound: -32601,
  invalidParams: -32602,
  internalError: -32603,
} as const

export type InferSchemaInput<T extends ZodType> = z.input<T>
export type InferSchemaOutput<T extends ZodType> = z.output<T>

type DebuggableError = Error & {
  readonly _tag?: string
  readonly httpStatus?: number
  readonly httpMessage?: string
  readonly cause?: unknown
}

type ErrorRecord = Record<string, unknown> & {
  readonly constructor?: {
    readonly name?: string
  }
}

const isNonEmptyString = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0

const asErrorRecord = (value: unknown): ErrorRecord | null =>
  typeof value === "object" && value !== null ? (value as ErrorRecord) : null

const getKnownErrorMessage = (value: unknown, depth = 0): string | null => {
  if (depth >= 4) {
    return null
  }

  if (value instanceof Error) {
    const record = value as DebuggableError & ErrorRecord

    if (isNonEmptyString(value.message)) {
      return value.message.trim()
    }
    if (isNonEmptyString(record.httpMessage)) {
      return record.httpMessage.trim()
    }
    if (isNonEmptyString(record._tag)) {
      return record._tag.trim()
    }
    if (isNonEmptyString(value.name) && value.name !== "Error") {
      return value.name.trim()
    }

    return "cause" in record ? getKnownErrorMessage(record.cause, depth + 1) : null
  }

  const record = asErrorRecord(value)
  if (!record) {
    return null
  }

  for (const key of ["message", "httpMessage", "_tag", "name", "type"] as const) {
    const candidate = record[key]
    if (isNonEmptyString(candidate)) {
      return candidate.trim()
    }
  }

  return "cause" in record ? getKnownErrorMessage(record.cause, depth + 1) : null
}

const getRpcErrorMessage = (error: unknown): string => {
  const primaryMessage = getKnownErrorMessage(error)
  const record = asErrorRecord(error)
  const causeMessage = record && "cause" in record ? getKnownErrorMessage(record.cause, 1) : null

  if (primaryMessage && causeMessage && primaryMessage !== causeMessage && !primaryMessage.includes(causeMessage)) {
    return `${primaryMessage}: ${causeMessage}`
  }

  return primaryMessage ?? "Unexpected RPC error"
}

const summarizeError = (error: unknown, depth = 0): unknown => {
  if (depth >= 3) {
    return { truncated: true }
  }

  if (error instanceof Error) {
    const errorRecord = error as DebuggableError & Record<string, unknown>
    const details = Object.fromEntries(
      Object.entries(errorRecord).filter(([key, value]) => {
        if (key === "cause" || key === "stack") {
          return false
        }

        return typeof value === "string" || typeof value === "number" || typeof value === "boolean" || value === null
      }),
    )

    return {
      type: error.constructor.name,
      name: error.name,
      message: isNonEmptyString(error.message) ? error.message : null,
      httpMessage: isNonEmptyString(errorRecord.httpMessage) ? errorRecord.httpMessage : null,
      tag: isNonEmptyString(errorRecord._tag) ? errorRecord._tag : null,
      httpStatus: typeof errorRecord.httpStatus === "number" ? errorRecord.httpStatus : null,
      stack: error.stack ?? null,
      details,
      cause: "cause" in errorRecord ? summarizeError(errorRecord.cause, depth + 1) : null,
    }
  }

  const record = asErrorRecord(error)
  if (record) {
    const details = Object.fromEntries(
      Object.entries(record).filter(([key, value]) => {
        if (key === "cause" || key === "stack") {
          return false
        }

        return typeof value === "string" || typeof value === "number" || typeof value === "boolean" || value === null
      }),
    )

    return {
      type: record.constructor?.name ?? "Object",
      message: getKnownErrorMessage(record),
      details,
      cause: "cause" in record ? summarizeError(record.cause, depth + 1) : null,
    }
  }

  return {
    value: error === undefined ? "undefined" : String(error),
  }
}

export function createRequest(
  method: string,
  params: Record<string, unknown>,
  id: number | string | null,
): JsonRpcRequest {
  return {
    jsonrpc: JSON_RPC_VERSION,
    method,
    params,
    id,
  }
}

export function createResponse(id: number | string | null, result?: unknown, error?: JsonRpcError): JsonRpcResponse {
  return {
    jsonrpc: JSON_RPC_VERSION,
    result,
    error,
    id,
  }
}

export function createInternalErrorResponse(id: JsonRpcId, error: unknown): JsonRpcResponse {
  return createResponse(id, undefined, {
    code: JsonRpcErrorCode.internalError,
    message: getRpcErrorMessage(error),
    data: summarizeError(error),
  })
}

const stripRpcErrorPrefix = (message: string): string => {
  const stripped = message.replace(/^RPC error\s+-?\d+:\s*/, "").trim()
  return stripped.length > 0 ? stripped : message.trim()
}

const extractRemoteRpcCause = (data: unknown): unknown => {
  if (typeof data !== "object" || data === null) {
    return data
  }

  if ("remoteError" in data) {
    return (data as { readonly remoteError?: unknown }).remoteError ?? data
  }

  return data
}

export class JsonRpcResponseError extends Error {
  readonly code: number
  readonly data: unknown
  readonly method: string
  readonly requestId: number | string

  constructor(input: {
    readonly code: number
    readonly message: string
    readonly data: unknown
    readonly method: string
    readonly requestId: number | string
  }) {
    const formattedMessage = input.message.startsWith("RPC error ")
      ? input.message
      : `RPC error ${input.code}: ${input.message}`

    super(formattedMessage)
    this.name = "JsonRpcResponseError"
    this.code = input.code
    this.data = input.data
    this.method = input.method
    this.requestId = input.requestId
  }

  get remoteCause(): unknown {
    return extractRemoteRpcCause(this.data)
  }

  get strippedMessage(): string {
    return stripRpcErrorPrefix(this.message)
  }
}

export function createJsonRpcResponseError(input: {
  readonly error: JsonRpcError
  readonly method: string
  readonly requestId: number | string
}): JsonRpcResponseError {
  return new JsonRpcResponseError({
    code: input.error.code,
    message: isNonEmptyString(input.error.message) ? input.error.message : "Unexpected remote RPC error",
    data: input.error.data ?? null,
    method: input.method,
    requestId: input.requestId,
  })
}

export function isRequest(message: JsonRpcMessage): message is JsonRpcRequest {
  return "method" in message
}

export function isResponse(message: JsonRpcMessage): message is JsonRpcResponse {
  return "result" in message || "error" in message
}

export function parseMessage(line: string): JsonRpcMessage | null {
  try {
    const parsed = JSON.parse(line)
    if (typeof parsed !== "object" || parsed === null) {
      return null
    }

    if ("method" in parsed) {
      return jsonRpcRequestSchema.parse(parsed)
    }

    if ("result" in parsed || "error" in parsed) {
      return jsonRpcResponseSchema.parse(parsed)
    }

    return null
  } catch {
    return null
  }
}

export function serializeMessage(message: JsonRpcMessage): string {
  return `${JSON.stringify(message)}\n`
}
