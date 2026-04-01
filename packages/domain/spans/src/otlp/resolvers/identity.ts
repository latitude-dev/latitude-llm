import type { Candidate } from "./utils.ts"
import { fromString } from "./utils.ts"

const VERCEL_PROVIDER_SUFFIX = /\.(chat|messages|responses|generative-ai|embed)$/

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
]

export const modelCandidates = [
  fromString("gen_ai.request.model"), // OTEL GenAI semconv
  fromString("llm.model_name"), // OpenInference / Arize Phoenix
  fromString("ai.model.id"), // Vercel AI SDK
  fromString("embedding.model_name"), // OpenInference (embeddings)
  fromString("reranker.model_name"), // OpenInference (reranker)
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
  fromString("langfuse.user.id"), // Langfuse
  fromString("user.id"), // OpenInference / Arize Phoenix
  fromString("traceloop.association.properties.user_id"), // Traceloop / OpenLLMetry
  fromString("langsmith.metadata.user_id"), // LangSmith
  fromString("gen_ai.request.user"), // OpenLIT (mirrors OpenAI API user param)
]
