/**
 * Pricing modifiers a provider reports in its response `usage` object: which speed tier served
 * the request, where inference ran, and how long each cache write was bought for.
 *
 * None of these has an OTEL GenAI attribute — verified against the semconv attribute registry —
 * so our own telemetry emits them under `latitude.*`, beside the `latitude.tags` /
 * `latitude.metadata` attributes already in production. Inventing a `gen_ai.usage.*` spelling
 * would squat the standard namespace and guarantee a collision the day it is specified, so the
 * `latitude.*` keys below are the cross-exporter contract: any instrumentation can supply them.
 * The only non-`latitude` keys read here are the OpenAI service-tier attributes that already
 * exist — one in the semconv registry, one emitted by OpenLLMetry in production.
 */

import { attrArray, intAttr } from "../../attributes.ts"
import type { OtlpKeyValue } from "../../types.ts"
import { first, fromString } from "../utils.ts"

/**
 * `latitude.usage.cache_creation.ttl.<seconds>` = tokens written at that lifetime.
 *
 * One flat int per observed lifetime rather than a nested object, so the values land in
 * ClickHouse's `attr_int` map and production is queryable before any migration reaches it. The
 * key carries the duration in seconds, never a tier name: a `cache_1h` key would bake one
 * provider's one tier into the wire format, while OpenAI's extended retention runs to 24 hours
 * and Gemini takes an arbitrary TTL.
 *
 * A single request may mix lifetimes — Anthropic requires 1h breakpoints to precede 5m ones —
 * which is why this is a per-span split and never one TTL label.
 */
const CACHE_CREATION_TTL_ATTR_PREFIX = "latitude.usage.cache_creation.ttl."

/** Normalized service tier (Anthropic `usage.speed`, OpenAI `service_tier`). */
const SERVICE_TIER_ATTR = "latitude.usage.service_tier"

/** Where inference ran (Anthropic `usage.inference_geo`). */
const INFERENCE_GEO_ATTR = "latitude.usage.inference_geo"

const CACHE_CREATION_TTL_ATTR_RE = new RegExp(`^${CACHE_CREATION_TTL_ATTR_PREFIX.replace(/\./g, "\\.")}(\\d+)$`)

const serviceTierCandidates = [
  fromString(SERVICE_TIER_ATTR),
  fromString("gen_ai.openai.response.service_tier"), // OTEL GenAI, OpenAI-specific
  fromString("openai.response.service_tier"), // OpenLLMetry
]

const inferenceGeoCandidates = [fromString(INFERENCE_GEO_ATTR)]

export interface ResolvedUsageModifiers {
  /** Raw provider value, empty when unreported. */
  readonly serviceTier: string
  /** Raw provider value, empty when unreported. */
  readonly inferenceGeo: string
  /** Cache-write tokens keyed by the lifetime in seconds they were bought at. */
  readonly cacheCreateTokensByTtlSeconds: Readonly<Record<number, number>>
}

function resolveCacheCreateByTtl(attrs: readonly OtlpKeyValue[]): Record<number, number> {
  const byTtl: Record<number, number> = {}

  for (const attr of attrArray(attrs)) {
    const match = CACHE_CREATION_TTL_ATTR_RE.exec(attr.key)
    if (!match?.[1]) continue
    const ttlSeconds = Number(match[1])
    const tokens = intAttr(attrs, attr.key)
    if (ttlSeconds <= 0 || tokens === undefined || tokens <= 0) continue
    byTtl[ttlSeconds] = (byTtl[ttlSeconds] ?? 0) + tokens
  }

  return byTtl
}

export function resolveUsageModifiers(attrs: readonly OtlpKeyValue[]): ResolvedUsageModifiers {
  return {
    serviceTier: first(serviceTierCandidates, attrs) ?? "",
    inferenceGeo: first(inferenceGeoCandidates, attrs) ?? "",
    cacheCreateTokensByTtlSeconds: resolveCacheCreateByTtl(attrs),
  }
}

/** The `latitude.*` attribute key for a cache-write lifetime, for emitters and tests. */
export function cacheCreationTtlAttrKey(ttlSeconds: number): string {
  return `${CACHE_CREATION_TTL_ATTR_PREFIX}${ttlSeconds}`
}
