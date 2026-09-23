/**
 * Lazy-loaded Inter TTFs for the server-rendered Agent Score ring.
 *
 * Inter rather than the incident chart's serif: the score page renders the ring in the product's
 * sans stack, and a serif number inside it would read as a different product. Two weights, because
 * the number is semibold and the labels are regular.
 *
 * Fetched from jsDelivr's npm mirror, cached in module scope, concurrent callers share one
 * in-flight promise. The fetch carries an `AbortSignal.timeout` so a slow CDN cannot hang an
 * inbound image request; the caller catches the throw and degrades to a transparent PNG.
 */
import { writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

const FONT_URLS = {
  regular: "https://cdn.jsdelivr.net/npm/@expo-google-fonts/inter@0.2.3/Inter_400Regular.ttf",
  semibold: "https://cdn.jsdelivr.net/npm/@expo-google-fonts/inter@0.2.3/Inter_600SemiBold.ttf",
} as const

type FontWeight = keyof typeof FONT_URLS

const FONT_FETCH_TIMEOUT_MS = 5_000

const cached = new Map<FontWeight, string>()
const inFlight = new Map<FontWeight, Promise<string>>()

const fetchFontFile = async (weight: FontWeight): Promise<string> => {
  const res = await fetch(FONT_URLS[weight], { signal: AbortSignal.timeout(FONT_FETCH_TIMEOUT_MS) })
  if (!res.ok) throw new Error(`Failed to fetch Inter ${weight}: ${res.status} ${res.statusText}`)
  const path = join(tmpdir(), `latitude-inter-${weight}.ttf`)
  await writeFile(path, Buffer.from(await res.arrayBuffer()))
  return path
}

const getFontFile = async (weight: FontWeight): Promise<string> => {
  const hit = cached.get(weight)
  if (hit) return hit
  let pending = inFlight.get(weight)
  if (!pending) {
    pending = fetchFontFile(weight)
      .then((path) => {
        cached.set(weight, path)
        return path
      })
      .finally(() => {
        inFlight.delete(weight)
      })
    inFlight.set(weight, pending)
  }
  return pending
}

/** Both weights on disk, which is what Resvg's `fontFiles` option wants. */
export const getScoreFontFiles = async (): Promise<string[]> =>
  Promise.all([getFontFile("regular"), getFontFile("semibold")])
