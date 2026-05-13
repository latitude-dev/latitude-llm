/**
 * Lazy-loaded TTF buffers for the OG card renderer.
 *
 * Satori needs raw TTF / OTF / WOFF (not WOFF2) and our font choice for
 * the page (Georgia) is a system font we can't ship. We fetch Source
 * Serif 4 static TTFs from jsDelivr's mirror of the Google Fonts repo and
 * cache them in module scope, so only the first OG request pays the
 * network cost.
 *
 * Two weights — regular for body, semibold for headline — keeps the OG
 * card visually anchored without bloating the bundle.
 */

const FONT_URLS = {
  regular: "https://cdn.jsdelivr.net/gh/google/fonts/ofl/sourceserif4/static/SourceSerif4-Regular.ttf",
  semibold: "https://cdn.jsdelivr.net/gh/google/fonts/ofl/sourceserif4/static/SourceSerif4-Semibold.ttf",
} as const

type Weight = keyof typeof FONT_URLS

let cache: Partial<Record<Weight, ArrayBuffer>> = {}
let inFlight: Promise<void> | null = null

const fetchFonts = async (): Promise<void> => {
  const entries = await Promise.all(
    (Object.entries(FONT_URLS) as [Weight, string][]).map(async ([weight, url]) => {
      const res = await fetch(url)
      if (!res.ok) throw new Error(`Failed to fetch ${weight} font: ${res.status} ${res.statusText}`)
      return [weight, await res.arrayBuffer()] as const
    }),
  )
  cache = Object.fromEntries(entries)
}

/**
 * Returns the cached font buffers, fetching on first call. Concurrent
 * callers share the same in-flight promise so we never duplicate the
 * download.
 */
export const getOgFonts = async (): Promise<Record<Weight, ArrayBuffer>> => {
  if (cache.regular && cache.semibold) return cache as Record<Weight, ArrayBuffer>
  if (!inFlight) inFlight = fetchFonts().finally(() => (inFlight = null))
  await inFlight
  return cache as Record<Weight, ArrayBuffer>
}
