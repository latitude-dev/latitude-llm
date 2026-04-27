export type { GepaProcessOptions } from "./client.ts"
export { GepaClient, resolveGepaProcessOptions } from "./client.ts"
export {
  GEPA_BATCH_SIZE,
  GEPA_DEFAULT_SEED,
  GEPA_MAX_STAGNATION,
  GEPA_MAX_TIME,
  GEPA_MAX_TOKENS,
  GEPA_PROPOSER_MODEL,
  GEPA_PYTHON_ENTRY_MODULE,
  GEPA_RPC_METHODS,
} from "./constants.ts"
export { GepaOptimizerLive } from "./gepa-optimizer.ts"
export {
  buildGepaProposalPrompt,
  GEPA_PROPOSER_SYSTEM_PROMPT,
  gepaProposalOutputSchema,
} from "./prompts/proposer.ts"
export type {
  InferSchemaInput,
  InferSchemaOutput,
  JsonRpcError,
  JsonRpcMessage,
  JsonRpcRequest,
  JsonRpcResponse,
} from "./protocol.ts"
export {
  createRequest,
  createResponse,
  isRequest,
  isResponse,
  JSON_RPC_VERSION,
  JsonRpcErrorCode,
  jsonRpcErrorSchema,
  jsonRpcRequestSchema,
  jsonRpcResponseSchema,
  parseMessage,
  serializeMessage,
} from "./protocol.ts"
