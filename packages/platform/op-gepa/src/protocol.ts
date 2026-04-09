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

export const JsonRpcErrorCode = {
  parseError: -32700,
  invalidRequest: -32600,
  methodNotFound: -32601,
  invalidParams: -32602,
  internalError: -32603,
} as const

export type InferSchemaInput<T extends ZodType> = z.input<T>
export type InferSchemaOutput<T extends ZodType> = z.output<T>

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
