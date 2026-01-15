import { z, ZodObject, ZodRawShape, ZodTypeAny } from 'zod'

export const JSONRPC_VERSION = '2.0'

export const jsonRpcRequestSchema = z.object({
  jsonrpc: z.string().default(JSONRPC_VERSION),
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
  jsonrpc: z.string().default(JSONRPC_VERSION),
  result: z.unknown().optional(),
  error: jsonRpcErrorSchema.optional(),
  id: z.union([z.number(), z.string(), z.null()]),
})

export type JsonRpcRequest = z.infer<typeof jsonRpcRequestSchema>
export type JsonRpcError = z.infer<typeof jsonRpcErrorSchema>
export type JsonRpcResponse = z.infer<typeof jsonRpcResponseSchema>

export const RpcErrorCode = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
} as const

export type RpcMessage = JsonRpcRequest | JsonRpcResponse

export const emptyResponseSchema = z.object({})
export type EmptyResponse = z.infer<typeof emptyResponseSchema>

export type InferSchemaInput<T extends ZodTypeAny> = z.input<T>
export type InferSchemaOutput<T extends ZodTypeAny> = z.output<T>

export type RpcSchema<
  P extends ZodObject<ZodRawShape> = ZodObject<ZodRawShape>,
  R extends ZodObject<ZodRawShape> = ZodObject<ZodRawShape>,
> = {
  params: P
  result: R
}

export function createRequest(
  method: string,
  params: Record<string, unknown>,
  id: number | string | null,
): JsonRpcRequest {
  return {
    jsonrpc: JSONRPC_VERSION,
    method,
    params,
    id,
  }
}

export function createResponse(
  id: number | string | null,
  result?: unknown,
  error?: JsonRpcError,
): JsonRpcResponse {
  return {
    jsonrpc: JSONRPC_VERSION,
    result,
    error,
    id,
  }
}

export function isRequest(msg: RpcMessage): msg is JsonRpcRequest {
  return 'method' in msg
}

export function isResponse(msg: RpcMessage): msg is JsonRpcResponse {
  return 'result' in msg || 'error' in msg
}

export function parseMessage(line: string): RpcMessage | null {
  try {
    const data = JSON.parse(line)
    if (typeof data !== 'object' || data === null) return null
    return data as RpcMessage
  } catch {
    return null
  }
}

export function serializeMessage(msg: RpcMessage): string {
  return JSON.stringify(msg) + '\n'
}
