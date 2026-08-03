import { resolveProviderName } from "@domain/models"
import { stringAttr } from "../attributes.ts"
import type { OtlpKeyValue } from "../types.ts"
import type { Candidate } from "./utils.ts"
import { first, fromString } from "./utils.ts"

// Claude Code embeds ANSI color codes in the `model` attribute (e.g.
// `"\x1b[32mclaude-opus-4-5\x1b[0m"`); strip them. No other source does this.
const ANSI_SGR_RE = new RegExp(`${String.fromCharCode(0x1b)}\\[[0-9;]*m`, "g")
function sanitizeModelName(raw: string): string {
  return raw
    .replace(ANSI_SGR_RE, "")
    .replace(/\[[0-9;]*m$/i, "")
    .trim()
}

// OpenInference's LangChain instrumentation nests the provider in a JSON `metadata` attribute as
// LangSmith's `ls_provider` (e.g. "openai") rather than emitting llm.system / llm.provider.
function providerFromOpenInferenceMetadata(attrs: readonly OtlpKeyValue[]): string | undefined {
  const raw = stringAttr(attrs, "metadata")
  if (!raw) return undefined
  try {
    const meta = JSON.parse(raw) as { ls_provider?: unknown }
    return typeof meta.ls_provider === "string" ? resolveProviderName(meta.ls_provider) : undefined
  } catch {
    return undefined
  }
}

const providerCandidates: Candidate<string>[] = [
  fromString("gen_ai.provider.name", resolveProviderName), // OTEL GenAI v1.37+
  fromString("gen_ai.model.provider", resolveProviderName), // Cloudflare AI Gateway OTEL export
  fromString("gen_ai.system", resolveProviderName), // OTEL GenAI v1.36 deprecated
  fromString("llm.system", resolveProviderName), // OpenInference / Arize Phoenix
  fromString("llm.provider", resolveProviderName), // OpenInference (DSPy, LiteLLM) — no llm.system
  { resolve: (attrs) => providerFromOpenInferenceMetadata(attrs) }, // OpenInference LangChain (LangSmith metadata)
  fromString("ai.model.provider", resolveProviderName), // Vercel AI SDK
  {
    resolve: (attrs) => (stringAttr(attrs, "span.type") === "llm_request" ? "anthropic" : undefined),
  }, // Claude Code
]

function anthropicProviderFromClaudeCodeSpanName(spanName: string): string | undefined {
  if (!spanName.startsWith("claude_code.llm_request")) return undefined
  return "anthropic"
}

/**
 * Resolves telemetry provider from span attributes, with a fallback for Agent SDK
 * span names (`claude_code.llm_request`) when `span.type` is absent.
 */
export function resolveProvider(spanAttrs: readonly OtlpKeyValue[], spanName: string): string {
  return first(providerCandidates, spanAttrs) ?? anthropicProviderFromClaudeCodeSpanName(spanName) ?? ""
}

export const modelCandidates: Candidate<string>[] = [
  fromString("gen_ai.request.model"), // OTEL GenAI semconv
  fromString("llm.model_name"), // OpenInference / Arize Phoenix
  fromString("ai.model.id"), // Vercel AI SDK
  fromString("embedding.model_name"), // OpenInference (embeddings)
  fromString("reranker.model_name"), // OpenInference (reranker)
  {
    resolve: (attrs) => {
      const raw = stringAttr(attrs, "model")
      if (!raw) return undefined
      return sanitizeModelName(raw) || undefined
    },
  }, // Claude Code (strips ANSI escape codes)
]

// Agent name (subagent/agent identity), names preferred over ids. Resolved ungated like
// `model`: several sources stamp it on every span in scope, which is what feeds the rollup.
export const agentNameCandidates: Candidate<string>[] = [
  fromString("gen_ai.agent.name"), // OTEL GenAI semconv (Vercel AI SDK v7, generic OTEL)
  fromString("openai.agents.name"), // OpenAI Agents SDK bridge
  fromString("subagent.name"), // Claude Code
  fromString("subagent.type"), // Claude Code
  fromString("subagent.id", (v) => v.split(":")[0]?.trim() || undefined), // Claude Code
  fromString("openclaw.subagent.label"), // OpenClaw wrapper span
  fromString("openclaw.agent.name"), // OpenClaw agent span + children
  fromString("latitude.capture.name"), // Latitude capture wrapper
]

export const responseModelCandidates = [
  fromString("gen_ai.response.model"), // OTEL GenAI semconv
  fromString("ai.response.model"), // Vercel AI SDK
  fromString("llm.model_name"), // OpenInference / Arize Phoenix (shared key)
]

export const sessionIdCandidates = [
  fromString("session.id"), // OpenInference / Arize Phoenix. Also, OTEL standard for sessions.
  fromString("gen_ai.session.id"), // Proposed, not accepted yet.
  fromString("langfuse.session.id"), // Langfuse
  fromString("traceloop.association.properties.session_id"), // Traceloop / OpenLLMetry
  fromString("langsmith.trace.session_id"), // LangSmith
  fromString("session_id"), // Datadog / HoneyHive
  fromString("eve.session.id"), // Eve framework

  // Fallbacks
  // These do not actually represent sessions, they represent specific threads.
  // However, it is still a good fallback to have, at least for single-threaded sessions.
  fromString("wandb.thread_id"), // W&B Weave
  fromString("ai.telemetry.metadata.threadId"), // Opik (via Vercel AI SDK metadata)
  fromString("gen_ai.conversation.id"), // GenAI semconv
  fromString("eve.turn.id"), // Eve framework (per-turn thread fallback)
]

export const userIdCandidates = [
  fromString("user.id"), // OpenInference / Arize Phoenix
  fromString("enduser.id"), // OTEL enduser semconv
  fromString("gen_ai.request.user"), // OpenLIT (mirrors OpenAI API user param)
  fromString("traceloop.association.properties.user_id"), // Traceloop / OpenLLMetry
  fromString("langsmith.metadata.user_id"), // LangSmith
  fromString("langfuse.user.id"), // Langfuse
]

export const userEmailCandidates = [
  fromString("user.email"), // Latitude / OpenInference
  fromString("enduser.email"), // OTEL enduser semconv
  fromString("langfuse.user.email"), // Langfuse
]
