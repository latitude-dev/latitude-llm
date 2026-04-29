/**
 * Provider name resolution shared by the model registry (pricing lookups)
 * and consumers that need the canonical models.dev provider id (e.g.
 * picking a provider icon in the UI).
 *
 * Browser-safe: this module has no runtime dependencies and does not
 * import the bundled models.dev JSON.
 */

/**
 * Maps well-known provider identifiers to their models.dev equivalents.
 *
 * Providers whose internal names differ from the models.dev convention
 * are mapped here. Unknown providers pass through unchanged.
 */
export const PROVIDER_ALIASES: Record<string, string> = {
  amazon_bedrock: "amazon-bedrock",
  google_vertex: "google-vertex",
  anthropic_vertex: "anthropic-vertex",
  "openai-codex": "openai",
}

// Vercel AI SDK appends transport-style suffixes like `.responses` and `.chat`
// to provider ids. Strip them so lookups resolve to the base provider.
const VERCEL_PROVIDER_SUFFIX = /\.(chat|messages|responses|generative-ai|embed)$/

export function resolveProviderName(provider: string): string {
  const stripped = provider.replace(VERCEL_PROVIDER_SUFFIX, "")
  return PROVIDER_ALIASES[stripped] ?? stripped
}
