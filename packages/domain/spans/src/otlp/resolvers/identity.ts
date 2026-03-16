import type { Candidate } from "./index.ts"
import { fromString } from "./index.ts"

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
  fromString("gen_ai.provider.name", aliasProvider),
  fromString("gen_ai.system", aliasProvider),
  fromString("llm.system", aliasProvider),
  fromString("ai.model.provider", (v) => {
    const stripped = v.replace(VERCEL_PROVIDER_SUFFIX, "")
    return PROVIDER_ALIASES[stripped] ?? stripped
  }),
]

export const modelCandidates = [
  fromString("gen_ai.request.model"),
  fromString("llm.model_name"),
  fromString("ai.model.id"),
  fromString("embedding.model_name"),
  fromString("reranker.model_name"),
]

export const responseModelCandidates = [
  fromString("gen_ai.response.model"),
  fromString("ai.response.model"),
  fromString("llm.model_name"),
]
