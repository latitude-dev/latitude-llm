/**
 * Latitude projects our own LLM generations are dogfooded into — one per internal AI feature, so
 * issues/metrics/escalation are scoped per feature instead of pooled into a single project.
 *
 * Each feature sets the matching slug as `capture`'s `project` option (the `latitude.project` span
 * attribute) on its telemetry. Slugs are hard-coded (not env-driven) because auth is org-scoped — a
 * single API key authenticates every project in the org — so we only need the slugs to match the
 * projects that exist in the dogfood org. The seed (`seeds.ts`) creates exactly these slugs; the
 * production dogfood org must have the same set created before routed spans land.
 *
 * Only `AI.generate` calls are exported to Latitude (`AI.embed` / `AI.rerank` are not traced), so
 * every tracked internal generation maps to one of these projects.
 */
export const LATITUDE_TELEMETRY_PROJECT_SLUGS = {
  signalDiscovery: "latitude-signal-discovery",
  annotationEnrichment: "latitude-annotation-enrichment",
  flaggers: "latitude-flaggers",
  evaluations: "latitude-evaluations",
  signalGeneration: "latitude-signal-generation",
  optimizations: "latitude-optimizations",
  taxonomy: "latitude-taxonomy",
  conversationIntelligence: "latitude-conversation-intelligence",
} as const satisfies Record<string, string>

export type LatitudeTelemetryProjectSlug =
  (typeof LATITUDE_TELEMETRY_PROJECT_SLUGS)[keyof typeof LATITUDE_TELEMETRY_PROJECT_SLUGS]
