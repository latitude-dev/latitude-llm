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

// Vercel wrappers duplicate their leaves' usage; agent_step keeps them out of the rollup,
// while a trace-root wrapper is the agent itself (invoke_agent, in resolveOperation).
const VERCEL_OPERATION: Record<string, Operation> = {
  "ai.generateText": "agent_step",
  "ai.generateText.doGenerate": "chat",
  "ai.streamText": "agent_step",
  "ai.streamText.doStream": "chat",
  "ai.generateObject": "agent_step",
  "ai.generateObject.doGenerate": "chat",
  "ai.streamObject": "agent_step",
  "ai.streamObject.doStream": "chat",
  "ai.embed": "embeddings",
  "ai.embed.doEmbed": "embeddings",
  "ai.embedMany": "embeddings",
  "ai.embedMany.doEmbed": "embeddings",
  "ai.toolCall": "execute_tool",
}

const VERCEL_ROOT_AGENT_OPERATION_IDS: ReadonlySet<string> = new Set([
  "ai.generateText",
  "ai.streamText",
  "ai.generateObject",
  "ai.streamObject",
])

// Latitude's openai-agents TS bridge tags non-LLM spans with latitude.span.kind=agents.*
// (its LLM span already sets gen_ai.operation.name=chat). Map only these wrapper/tool spans.
const OPENAI_AGENTS_OPERATION: Record<string, Operation> = {
  "agents.function": "execute_tool",
  "agents.agent": "invoke_agent",
  "agents.trace": "invoke_agent",
  "agents.handoff": "invoke_agent",
  "agents.guardrail": "guardrail",
}

// `interaction` orchestrates a turn's generations + tool calls (and nests via
// tool:Agent) exactly like an agent invocation, so it maps to invoke_agent — the
// lossy-wrapper contract holds (no own usage; truth lives on the chat leaves).
const CLAUDE_CODE_OPERATION: Record<string, string> = {
  llm_request: "chat",
  interaction: "invoke_agent",
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
  if (rest === "interaction") return "invoke_agent"
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

const CLOUDFLARE_AIG_SPAN_NAME = "cf.aig.request"

// Cloudflare AI Gateway hardcodes gen_ai.operation.name=chat for every request, including
// embeddings. Detect the embedding response shape ({data,shape}, no chat envelope) and
// reclassify so it isn't miscounted as a generation.
function isCloudflareEmbeddingsSpan(attrs: readonly OtlpKeyValue[], spanName: string): boolean {
  if (spanName !== CLOUDFLARE_AIG_SPAN_NAME) return false
  const out = stringAttr(attrs, "gen_ai.output.messages") ?? stringAttr(attrs, "gen_ai.completion_json")
  if (!out) return false
  try {
    const parsed = JSON.parse(out) as Record<string, unknown>
    const result = parsed.result
    const body = (result && typeof result === "object" ? result : parsed) as Record<string, unknown>
    return Array.isArray(body.data) && Array.isArray(body.shape) && !("choices" in body) && !("content" in body)
  } catch {
    return false
  }
}

// CrewAI's OpenInference instrumentor carries the whole conversation on the AGENT span (no
// LLM leaf), so classify those `chat` for the rollup; other frameworks' AGENT spans keep
// `invoke_agent` (they have real LLM leaves).
export function resolveOperation(
  spanAttrs: readonly OtlpKeyValue[],
  spanName: string,
  scopeName = "",
  hasParent = true,
): string {
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
  if (!hasParent && VERCEL_ROOT_AGENT_OPERATION_IDS.has(stringAttr(spanAttrs, "ai.operationId") ?? "")) {
    return "invoke_agent"
  }
  const operation =
    first(operationCandidates, spanAttrs) ?? operationFromClaudeCodeNativeSpanName(spanName) ?? "unspecified"
  if (operation === "chat" && isCloudflareEmbeddingsSpan(spanAttrs, spanName)) return "embeddings"
  return operation
}
