import type { Operation } from "../../entities/span.ts"
import { fromString } from "./utils.ts"

const OPENINFERENCE_OPERATION: Record<string, Operation> = {
  LLM: "chat",
  EMBEDDING: "embeddings",
  RETRIEVER: "retrieval",
  TOOL: "execute_tool",
  AGENT: "invoke_agent",
  CHAIN: "chain",
  RERANKER: "reranker",
  GUARDRAIL: "guardrail",
  EVALUATOR: "evaluator",
  PROMPT: "prompt",
}

const OPENLLMETRY_OPERATION: Record<string, Operation> = {
  completion: "text_completion",
  embedding: "embeddings",
  rerank: "reranker",
  agent: "invoke_agent",
  tool: "execute_tool",
}

const VERCEL_OPERATION: Record<string, Operation> = {
  "ai.generateText": "chat",
  "ai.generateText.doGenerate": "chat",
  "ai.streamText": "chat",
  "ai.streamText.doStream": "chat",
  "ai.generateObject": "chat",
  "ai.generateObject.doGenerate": "chat",
  "ai.streamObject": "chat",
  "ai.streamObject.doStream": "chat",
  "ai.embed": "embeddings",
  "ai.embed.doEmbed": "embeddings",
  "ai.embedMany": "embeddings",
  "ai.embedMany.doEmbed": "embeddings",
  "ai.toolCall": "execute_tool",
}

const CLAUDE_CODE_OPERATION: Record<string, string> = {
  llm_request: "chat",
  interaction: "prompt",
  tool_execution: "execute_tool",
}

export const operationCandidates = [
  fromString("gen_ai.operation.name"), // OTEL GenAI semconv (v1.37+ and v1.36)
  fromString("openinference.span.kind", (v) => OPENINFERENCE_OPERATION[v] ?? v.toLowerCase()), // OpenInference / Arize Phoenix
  fromString("llm.request.type", (v) => OPENLLMETRY_OPERATION[v] ?? v), // OpenLLMetry / Traceloop
  fromString("ai.operationId", (v) => VERCEL_OPERATION[v] ?? v), // Vercel AI SDK
  fromString("span.type", (v) => CLAUDE_CODE_OPERATION[v]), // Claude Code
]
