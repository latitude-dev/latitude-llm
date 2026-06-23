import type { Operation } from "../../entities/span.ts"
import { stringAttr } from "../attributes.ts"
import type { OtlpKeyValue } from "../types.ts"
import { first, fromString } from "./utils.ts"

const CREWAI_OPENINFERENCE_SCOPE = "openinference.instrumentation.crewai"

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

// Vercel v7's @ai-sdk/otel emits `rerank`; our literal is `reranker`. Others pass through.
const GENAI_OPERATION: Record<string, Operation> = {
  rerank: "reranker",
}

// Bare ai.generateText/streamText/generateObject/streamObject wrappers carry a lossy
// summary (no tool results); classify them invoke_agent so the rollup excludes them and
// the per-leaf .doGenerate/.doStream `chat` turns hold the real conversation.
const VERCEL_OPERATION: Record<string, Operation> = {
  "ai.generateText": "invoke_agent",
  "ai.generateText.doGenerate": "chat",
  "ai.streamText": "invoke_agent",
  "ai.streamText.doStream": "chat",
  "ai.generateObject": "invoke_agent",
  "ai.generateObject.doGenerate": "chat",
  "ai.streamObject": "invoke_agent",
  "ai.streamObject.doStream": "chat",
  "ai.embed": "embeddings",
  "ai.embed.doEmbed": "embeddings",
  "ai.embedMany": "embeddings",
  "ai.embedMany.doEmbed": "embeddings",
  "ai.toolCall": "execute_tool",
}

// Latitude's openai-agents TS bridge tags non-LLM spans with latitude.span.kind=agents.*
// (its LLM span already sets gen_ai.operation.name=chat). Map only these wrapper/tool spans.
const OPENAI_AGENTS_OPERATION: Record<string, Operation> = {
  "agents.function": "execute_tool",
  "agents.agent": "invoke_agent",
  "agents.trace": "invoke_agent",
  "agents.handoff": "invoke_agent",
  "agents.guardrail": "guardrail",
}

const CLAUDE_CODE_OPERATION: Record<string, string> = {
  llm_request: "chat",
  interaction: "prompt",
  tool_execution: "execute_tool",
  /** Native Claude Code / Agent SDK OTEL (`claude_code.tool` spans) */
  tool: "execute_tool",
}

const OPENCLAW_TELEMETRY_SCOPE = "openclaw"
const OPENCLAW_SPAN_OPERATION: Record<string, Operation> = {
  "openclaw.run": "invoke_agent",
  "openclaw.tool.execution": "execute_tool",
}

const CLAUDE_CODE_NATIVE_SPAN_PREFIX = "claude_code."

/**
 * Maps Agent SDK and Claude Code CLI span **names** (`claude_code.*`) when the
 * `span.type` attribute is absent (native OpenTelemetry export path).
 */
function operationFromClaudeCodeNativeSpanName(spanName: string): string | undefined {
  if (!spanName.startsWith(CLAUDE_CODE_NATIVE_SPAN_PREFIX)) return undefined
  const rest = spanName.slice(CLAUDE_CODE_NATIVE_SPAN_PREFIX.length)
  if (rest === "interaction") return "prompt"
  if (rest === "llm_request") return "chat"
  if (rest === "tool" || rest.startsWith("tool.")) return "execute_tool"
  return undefined
}

const operationCandidates = [
  fromString("gen_ai.operation.name", (v) => GENAI_OPERATION[v] ?? v), // OTEL GenAI semconv (v1.37+ and v1.36)
  fromString("openinference.span.kind", (v) => OPENINFERENCE_OPERATION[v] ?? v.toLowerCase()), // OpenInference / Arize Phoenix
  fromString("llm.request.type", (v) => OPENLLMETRY_OPERATION[v] ?? v), // OpenLLMetry / Traceloop
  fromString("ai.operationId", (v) => VERCEL_OPERATION[v] ?? v), // Vercel AI SDK
  fromString("latitude.span.kind", (v) => OPENAI_AGENTS_OPERATION[v]), // OpenAI Agents
  fromString("span.type", (v) => CLAUDE_CODE_OPERATION[v]), // Claude Code
]

// CrewAI's OpenInference instrumentor carries the whole conversation on the AGENT span (no
// LLM leaf), so classify those `chat` for the rollup; other frameworks' AGENT spans keep
// `invoke_agent` (they have real LLM leaves).
export function resolveOperation(spanAttrs: readonly OtlpKeyValue[], spanName: string, scopeName = ""): string {
  if (
    scopeName.startsWith(CREWAI_OPENINFERENCE_SCOPE) &&
    stringAttr(spanAttrs, "openinference.span.kind") === "AGENT"
  ) {
    return "chat"
  }
  if (scopeName === OPENCLAW_TELEMETRY_SCOPE) {
    const mapped = OPENCLAW_SPAN_OPERATION[spanName]
    if (mapped) return mapped
  }
  return first(operationCandidates, spanAttrs) ?? operationFromClaudeCodeNativeSpanName(spanName) ?? "unspecified"
}
