/**
 * Lazy-loaded TTF buffer for the incident-trend email chart. Satori
 * needs real TTF/OTF (not WOFF2), and the chart only carries a handful
 * of small labels so a single regular weight is enough. Fetched from
 * jsDelivr's npm mirror of the Adobe Source Serif Pro release — same
 * source the wrapped OG renderer uses, so caches warm together when
 * both surfaces render on the same node.
 *
 * Cached in module scope; concurrent callers share an in-flight
 * promise. The fetch carries an `AbortSignal.timeout` so a slow CDN
 * doesn't hang an inbound chart request indefinitely — the caller
 * catches the throw and degrades to the 1×1 transparent PNG fallback.
 */
import { writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

const FONT_URL = "https://cdn.jsdelivr.net/npm/@expo-google-fonts/source-serif-pro@0.2.3/SourceSerifPro_400Regular.ttf"
const FONT_FETCH_TIMEOUT_MS = 5_000

let cached: ArrayBuffer | null = null
let inFlight: Promise<ArrayBuffer> | null = null

const fetchFont = async (): Promise<ArrayBuffer> => {
  const res = await fetch(FONT_URL, { signal: AbortSignal.timeout(FONT_FETCH_TIMEOUT_MS) })
  if (!res.ok) throw new Error(`Failed to fetch chart font: ${res.status} ${res.statusText}`)
  return res.arrayBuffer()
}

const getChartFont = async (): Promise<ArrayBuffer> => {
  if (cached) return cached
  if (!inFlight) {
    inFlight = fetchFont()
      .then((buf) => {
        cached = buf
        return buf
      })
      .finally(() => {
        inFlight = null
      })
  }
  return inFlight
}

/**
 * Path to the chart font on disk, for Resvg's `font.fontFiles` option (resvg-js 2.6.2 has no
 * in-memory `fontBuffers`, so the buffer is materialised to a temp file once and the path is
 * cached). The hand-built incident-trend SVG uses Resvg to lay out `<text>` axis labels, which
 * needs a real font file — unlike the prior Satori path that vectorised glyphs in-process.
 */
let fontFilePromise: Promise<string> | null = null

export const getChartFontFile = async (): Promise<string> => {
  if (!fontFilePromise) {
    fontFilePromise = (async () => {
      const buffer = await getChartFont()
      const filePath = join(tmpdir(), "latitude-incident-trend-source-serif-pro-400.ttf")
      await writeFile(filePath, Buffer.from(buffer))
      return filePath
    })().catch((error) => {
      // Reset so a transient fs/CDN failure can be retried on the next render instead of
      // poisoning the cache permanently.
      fontFilePromise = null
      throw error
    })
  }
  return fontFilePromise
}
