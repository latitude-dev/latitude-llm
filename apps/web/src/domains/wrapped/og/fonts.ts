/**
 * Lazy-loaded TTF buffers for the OG card renderer.
 *
 * Satori needs raw TTF / OTF / WOFF (not WOFF2) and our page font (Georgia)
 * is a system font we can't ship. We fetch Source Serif Pro static TTFs
 * from the npm-packaged Adobe source release via jsDelivr's mirror — that
 * package has stable file paths and ships real TTFs (not WOFF2), unlike
 * the Source Serif 4 release in `google/fonts` which is variable-only.
 *
 * Two weights — regular for body, semibold for headline — keeps the OG
 * card visually anchored without bloating the bundle.
 *
 * Buffers are cached in module scope, so only the first OG request pays
 * the network cost.
 */

// Pinned to a specific version so the URLs don't drift if @latest changes.
const FONT_URLS = {
  regular: "https://cdn.jsdelivr.net/npm/@expo-google-fonts/source-serif-pro@0.2.3/SourceSerifPro_400Regular.ttf",
  semibold: "https://cdn.jsdelivr.net/npm/@expo-google-fonts/source-serif-pro@0.2.3/SourceSerifPro_600SemiBold.ttf",
} as const

type Weight = keyof typeof FONT_URLS

let cache: Partial<Record<Weight, ArrayBuffer>> = {}
let inFlight: Promise<void> | null = null

const fetchFonts = async (): Promise<void> => {
  const entries = await Promise.all(
    (Object.entries(FONT_URLS) as [Weight, string][]).map(async ([weight, url]) => {
      const res = await fetch(url)
      if (!res.ok) throw new Error(`Failed to fetch ${weight} font from ${url}: ${res.status} ${res.statusText}`)
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
