/**
 * The single provider-name normalization used everywhere: OTLP span ingestion, registry pricing
 * lookups, and consumers that need the canonical models.dev provider id (e.g. picking a provider
 * icon in the UI).
 *
 * It lives here, rather than beside the span resolvers, because a second copy is what let
 * `anthropic_vertex` mean two different things at once — one map resolved it to a provider
 * models.dev does not have, which silently prices every call for it at 0.
 *
 * Browser-safe: this module has no runtime dependencies and does not import the bundled
 * models.dev JSON.
 */

/**
 * Maps provider identifiers to their models.dev equivalents. Unknown providers pass through
 * unchanged so they surface as unpriced under their real name rather than a guess.
 *
 * Every target must be a provider id models.dev actually prices; `provider-aliases.test.ts`
 * asserts that, because a bad target fails silently as cost 0.
 */
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
  // OTel GenAI well-known names from Vercel AI SDK v7's @ai-sdk/otel.
  "gcp.vertex_ai": "google-vertex",
  "gcp.gemini": "google",
  "aws.bedrock": "amazon-bedrock",
  "azure.ai.openai": "azure",
  "azure.ai.inference": "azure",
  x_ai: "xai",
  "gcp.vertex.agent": "google-vertex", // Google ADK generate_content leaves
  "gcp.gen_ai": "google", // Mastra's canonical key for the direct Gemini API
  // Mastra reports the SDK's npm package name instead of an OTEL well-known value. Spelled out
  // rather than derived from the npm scope: a suffix rule would read `@ai-sdk/fireworks` as
  // `fireworks` (models.dev calls it `fireworks-ai`) and would turn every non-provider package in
  // a scope into a provider, inventing ids that price to 0.
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

/**
 * Case-folds before the lookup, not after: alias keys are lowercase, so folding the result instead
 * would miss the alias entirely for a non-canonical casing like `Amazon_Bedrock`.
 */
export function resolveProviderName(provider: string): string {
  const normalized = provider.toLowerCase().replace(VERCEL_PROVIDER_SUFFIX, "")
  return PROVIDER_ALIASES[normalized] ?? normalized
}
