import { parseEnvOptional } from "@platform/env"
import { createLogger } from "@repo/observability"
import { Effect } from "effect"
import { getRedisClient } from "./clients.ts"

/**
 * GeoIP lookup helper used by the backoffice Sessions panel to label a
 * session row with its approximate location.
 *
 * Strategy:
 * - **RFC 1918 / loopback / link-local IPs short-circuit to `null`.**
 *   The UI surfaces these as "Local network" so the absence of a city
 *   reads intentionally rather than as a lookup failure.
 * - **Redis cache (`geoip:<ip>`, 24 h TTL) absorbs the steady-state
 *   load.** A staff member opening the same dashboard 30 times in a
 *   day issues at most one upstream call per IP per day.
 * - **`ipinfo.io` free tier on miss.** Anonymous tier is rate-limited
 *   to ~50k req/month per IP, which is comfortably above the load a
 *   handful of staff opening dashboards generates. Set
 *   `LAT_IPINFO_TOKEN` to use the authenticated tier when usage grows.
 * - **Failures fall through to `null`.** A flaky upstream must never
 *   block the dashboard — the UI shows "Unknown" for the location
 *   field when this returns null.
 *
 * Negative results (an IP we couldn't resolve) are also cached, with a
 * shorter TTL, so a transient outage doesn't cause every page load to
 * re-issue the upstream request for the same hot IPs.
 */

const logger = createLogger("admin-geoip")

const POSITIVE_TTL_SECONDS = 60 * 60 * 24
const NEGATIVE_TTL_SECONDS = 60 * 5

export interface GeoIpInfo {
  /** Two-letter ISO country code (e.g. "US"). */
  readonly country: string | null
  /** City name as ipinfo reports it, when available. */
  readonly city: string | null
  /** Region / state, when available. */
  readonly region: string | null
}

const IPINFO_RESPONSE_KEYS = ["country", "city", "region"] as const

/**
 * RFC 1918, RFC 4193, link-local, and loopback ranges. We don't bother
 * pulling in a CIDR library — the leading-octet test catches every
 * private range that a normal session row would carry, and false
 * positives here just mean we skip a lookup we couldn't have completed
 * anyway (ipinfo's free tier returns 404 for private IPs).
 */
const isPrivateOrLocalIp = (ip: string): boolean => {
  const trimmed = ip.trim()
  if (trimmed === "" || trimmed === "::1" || trimmed === "127.0.0.1") return true
  // IPv6 link-local / unique-local
  if (trimmed.toLowerCase().startsWith("fe80:") || trimmed.toLowerCase().startsWith("fc")) return true
  if (trimmed.toLowerCase().startsWith("fd")) return true
  // IPv4 private ranges
  if (trimmed.startsWith("10.")) return true
  if (trimmed.startsWith("192.168.")) return true
  if (trimmed.startsWith("169.254.")) return true
  if (trimmed.startsWith("172.")) {
    const second = Number(trimmed.split(".")[1])
    if (Number.isInteger(second) && second >= 16 && second <= 31) return true
  }
  return false
}

const buildCacheKey = (ip: string) => `geoip:${ip}`

const NEGATIVE_SENTINEL = "__null__"

const readFromCache = async (ip: string): Promise<GeoIpInfo | null | undefined> => {
  try {
    const cached = await getRedisClient().get(buildCacheKey(ip))
    if (cached === null) return undefined
    if (cached === NEGATIVE_SENTINEL) return null
    const parsed: unknown = JSON.parse(cached)
    if (parsed && typeof parsed === "object" && "country" in parsed) {
      return parsed as GeoIpInfo
    }
  } catch (error) {
    logger.warn("geoip cache read failed", error)
  }
  return undefined
}

const writeToCache = async (ip: string, info: GeoIpInfo | null): Promise<void> => {
  try {
    if (info === null) {
      await getRedisClient().set(buildCacheKey(ip), NEGATIVE_SENTINEL, "EX", NEGATIVE_TTL_SECONDS)
    } else {
      await getRedisClient().set(buildCacheKey(ip), JSON.stringify(info), "EX", POSITIVE_TTL_SECONDS)
    }
  } catch (error) {
    logger.warn("geoip cache write failed", error)
  }
}

const fetchFromIpinfo = async (ip: string): Promise<GeoIpInfo | null> => {
  const token = Effect.runSync(parseEnvOptional("LAT_IPINFO_TOKEN", "string"))
  const url = token
    ? `https://ipinfo.io/${encodeURIComponent(ip)}?token=${encodeURIComponent(token)}`
    : `https://ipinfo.io/${encodeURIComponent(ip)}/json`
  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      // ipinfo's edges are fast — a generous-but-bounded timeout keeps a
      // single slow lookup from stalling the whole dashboard render.
      signal: AbortSignal.timeout(2000),
    })
    if (!response.ok) {
      return null
    }
    const json = (await response.json()) as Record<string, unknown>
    const result: Record<string, string | null> = {}
    for (const key of IPINFO_RESPONSE_KEYS) {
      const raw = json[key]
      result[key] = typeof raw === "string" && raw.length > 0 ? raw : null
    }
    if (result.country === null && result.city === null && result.region === null) {
      return null
    }
    return result as unknown as GeoIpInfo
  } catch (error) {
    logger.warn(`geoip fetch failed for ${ip}`, error)
    return null
  }
}

/**
 * Resolve `ip` to a coarse location. Returns `null` for private,
 * loopback, link-local, or unresolvable addresses. Caches positive
 * results for 24 h and negative results for 5 min via Redis.
 *
 * Module-private — call sites use {@link lookupGeoIpBatch} so the
 * dedupe + parallel-fetch optimisation is applied uniformly.
 */
const lookupGeoIp = async (ip: string | null | undefined): Promise<GeoIpInfo | null> => {
  if (!ip || isPrivateOrLocalIp(ip)) return null

  const cached = await readFromCache(ip)
  if (cached !== undefined) return cached

  const fresh = await fetchFromIpinfo(ip)
  await writeToCache(ip, fresh)
  return fresh
}

/**
 * Look up multiple IPs in one shot, deduping by address so a dashboard
 * with several sessions at the same IP issues a single upstream call.
 * Returns a map keyed by the original IP string. Failures surface as
 * `null` in the map.
 */
export const lookupGeoIpBatch = async (
  ips: ReadonlyArray<string | null | undefined>,
): Promise<ReadonlyMap<string, GeoIpInfo | null>> => {
  const unique = Array.from(new Set(ips.filter((ip): ip is string => typeof ip === "string" && ip.length > 0)))
  const entries = await Promise.all(unique.map(async (ip) => [ip, await lookupGeoIp(ip)] as const))
  return new Map(entries)
}
