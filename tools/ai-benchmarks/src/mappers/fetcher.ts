import { mkdir, readFile, stat, writeFile } from "node:fs/promises"
import { dirname } from "node:path"

/**
 * Download `url` to `cachePath` if not already present; return the contents
 * as a Buffer.
 *
 * Used by benchmark mappers to pull upstream dataset snapshots — HuggingFace
 * `resolve` URLs, GitHub raw URLs, anything that's an HTTPS GET. Cache
 * invalidation is manual: callers must choose a new cache path when the
 * source revision changes (we pin revisions by including the SHA in the
 * path). The fetcher itself doesn't try to be clever about HTTP caching.
 *
 * `options.token` is an optional bearer token — pass `process.env.HF_TOKEN`
 * for gated HuggingFace datasets.
 */
export async function fetchCached(
  url: string,
  cachePath: string,
  options?: { readonly token?: string },
): Promise<Buffer> {
  const cached = await readIfExists(cachePath)
  if (cached) return cached

  const headers: Record<string, string> = {}
  if (options?.token) {
    headers.Authorization = `Bearer ${options.token}`
  }

  const response = await fetch(url, { headers })
  if (!response.ok) {
    throw new Error(`fetch ${url} failed: ${response.status} ${response.statusText}`)
  }

  const buffer = Buffer.from(await response.arrayBuffer())
  await mkdir(dirname(cachePath), { recursive: true })
  await writeFile(cachePath, buffer)
  return buffer
}

async function readIfExists(path: string): Promise<Buffer | null> {
  try {
    await stat(path)
    return await readFile(path)
  } catch {
    return null
  }
}
