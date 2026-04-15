import { stringAttr } from "../attributes.ts"
import type { Candidate } from "./utils.ts"
import { fromString } from "./utils.ts"

const VERCEL_PROVIDER_SUFFIX = /\.(chat|messages|responses|generative-ai|embed)$/

/**
 * Strip ANSI SGR escape sequences and trailing terminal noise from model strings.
 *
 * Claude Code emits the `model` attribute with ANSI color codes embedded (e.g.
 * `"\x1b[32mclaude-opus-4-5\x1b[0m"`) because it renders the value in a terminal
 * before writing it to the span. No other instrumentation source we know of does this.
 */
const ANSI_SGR_RE = new RegExp(`${String.fromCharCode(0x1b)}\\[[0-9;]*m`, "g")
function sanitizeModelName(raw: string): string {
  return raw
    .replace(ANSI_SGR_RE, "")
    .replace(/\[[0-9;]*m$/i, "")
    .trim()
}

const PROVIDER_ALIASES: Record<string, string> = {
  bedrock: "amazon-bedrock",
  amazon_bedrock: "amazon-bedrock",
  gemini: "google",
  "google.generative-ai": "google",
  vertexai: "google-vertex",
  vertex_ai: "google-vertex",
  google_vertex: "google-vertex",
  "google.vertex": "google-vertex",
  anthropic_vertex: "google-vertex-anthropic",
  mistralai: "mistral",
  mistral_ai: "mistral",
  together_ai: "togetherai",
  fireworks_ai: "fireworks-ai",
}

const aliasProvider = (v: string) => PROVIDER_ALIASES[v] ?? v

export const providerCandidates: Candidate<string>[] = [
  fromString("gen_ai.provider.name", aliasProvider), // OTEL GenAI v1.37+
  fromString("gen_ai.system", aliasProvider), // OTEL GenAI v1.36 deprecated
  fromString("llm.system", aliasProvider), // OpenInference / Arize Phoenix
  fromString("ai.model.provider", (v) => {
    // Vercel AI SDK
    const stripped = v.replace(VERCEL_PROVIDER_SUFFIX, "")
    return PROVIDER_ALIASES[stripped] ?? stripped
  }),
  { resolve: (attrs) => (stringAttr(attrs, "span.type") === "llm_request" ? "anthropic" : undefined) }, // Claude Code
]

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

  // Fallbacks
  // These do not actually represent sessions, they represent specific threads.
  // However, it is still a good fallback to have, at least for single-threaded sessions.
  fromString("wandb.thread_id"), // W&B Weave
  fromString("ai.telemetry.metadata.threadId"), // Opik (via Vercel AI SDK metadata)
  fromString("gen_ai.conversation.id"), // GenAI semconv
]

export const userIdCandidates = [
  fromString("user.id"), // OpenInference / Arize Phoenix
  fromString("gen_ai.request.user"), // OpenLIT (mirrors OpenAI API user param)
  fromString("traceloop.association.properties.user_id"), // Traceloop / OpenLLMetry
  fromString("langsmith.metadata.user_id"), // LangSmith
  fromString("langfuse.user.id"), // Langfuse
]
