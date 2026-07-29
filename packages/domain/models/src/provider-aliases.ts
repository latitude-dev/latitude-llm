/**
 * The single provider-name normalization: OTLP span ingestion, registry pricing lookups, and
 * consumers needing the canonical models.dev provider id (e.g. a provider icon in the UI).
 *
 * Browser-safe: this module has no runtime dependencies and does not import the bundled
 * models.dev JSON.
 */

// Every target must be a provider models.dev prices, or the lookup silently costs 0; the test asserts it.
export const PROVIDER_ALIASES: Record<string, string> = {
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
  workersai: "cloudflare-workers-ai",
  "workersai.chat": "cloudflare-workers-ai",
  "internal-workers-ai": "cloudflare-workers-ai", // Cloudflare AI Gateway (Workers AI upstream)
  "openai-codex": "openai",
  gateway: "vercel", // Vercel AI Gateway's own provider id; models.dev files it under `vercel`
  // OTel GenAI well-known names from Vercel AI SDK v7's @ai-sdk/otel.
  "gcp.vertex_ai": "google-vertex",
  "gcp.gemini": "google",
  "aws.bedrock": "amazon-bedrock",
  "azure.ai.openai": "azure",
  "azure.ai.inference": "azure",
  x_ai: "xai",
  "x-ai": "xai",
  "xai-oauth": "xai",
  "gcp.vertex.agent": "google-vertex", // Google ADK generate_content leaves
  "gcp.gen_ai": "google", // Mastra's canonical key for the direct Gemini API
  // Mastra reports npm package names. Listed, not scope-derived: `@ai-sdk/fireworks` is `fireworks-ai`.
  "@anthropic-ai/claude-agent-sdk": "anthropic",
  "@anthropic-ai/claude-code": "anthropic",
  "@anthropic-ai/sdk": "anthropic",
  "@google-cloud/vertexai": "google-vertex",
  "@google/genai": "google",
  "@mistralai/mistralai": "mistral",
  "@openai/agents": "openai",
  "@ai-sdk/amazon-bedrock": "amazon-bedrock",
  "@ai-sdk/anthropic": "anthropic",
  "@ai-sdk/azure": "azure",
  "@ai-sdk/cerebras": "cerebras",
  "@ai-sdk/cohere": "cohere",
  "@ai-sdk/deepinfra": "deepinfra",
  "@ai-sdk/deepseek": "deepseek",
  "@ai-sdk/fireworks": "fireworks-ai",
  "@ai-sdk/google": "google",
  "@ai-sdk/google-vertex": "google-vertex",
  "@ai-sdk/groq": "groq",
  "@ai-sdk/mistral": "mistral",
  "@ai-sdk/openai": "openai",
  "@ai-sdk/perplexity": "perplexity",
  "@ai-sdk/togetherai": "togetherai",
  "@ai-sdk/xai": "xai",
}

// Vercel AI SDK appends transport-style suffixes like `.responses` and `.chat`
// to provider ids. Strip them so lookups resolve to the base provider.
const VERCEL_PROVIDER_SUFFIX = /\.(chat|messages|responses|generative-ai|embed)$/

// Folds before the lookup, not after: alias keys are lowercase, so `Amazon_Bedrock` would miss.
export function resolveProviderName(provider: string): string {
  const normalized = provider.toLowerCase().replace(VERCEL_PROVIDER_SUFFIX, "")
  return PROVIDER_ALIASES[normalized] ?? normalized
}
