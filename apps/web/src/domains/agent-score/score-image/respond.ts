import { TRANSPARENT_1x1_PNG } from "./render-score-image.ts"

/**
 * A rendered image is cached for a year: the URL is its input, so the bytes behind it never change,
 * and every organisation reporting the same scores shares the one cached copy.
 */
const RENDERED_CACHE = "public, max-age=31536000, immutable"

/**
 * The fallback is never cached. It stands in for a failure that is usually transient (a font CDN
 * timeout, a render error), and because the URL is keyed by value rather than by notification,
 * caching it would blank the image for every organisation with those scores until it expired.
 */
const FALLBACK_CACHE = "no-store"

const png = (buffer: Buffer, cacheControl: string): Response =>
  // biome-ignore lint/suspicious/noExplicitAny: Node Buffer is a valid BodyInit; TS lib types disagree.
  new Response(buffer as any, {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": cacheControl,
      "Content-Length": String(buffer.byteLength),
    },
  })

export const respondRendered = (buffer: Buffer): Response => png(buffer, RENDERED_CACHE)

/** A 1×1 transparent PNG, so the embed still renders an element rather than a broken-image icon. */
export const respondFallback = (): Response => png(TRANSPARENT_1x1_PNG, FALLBACK_CACHE)
