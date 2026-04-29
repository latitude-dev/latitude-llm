import { createHash } from "node:crypto"
import { readFile, stat, writeFile } from "node:fs/promises"

interface FixtureMeta {
  readonly mapperHash: string
  readonly generatedAt: string
}

/**
 * Hash the mapper source files. Any change in any file — swapping sources,
 * bumping a pinned SHA, tweaking the label rule — flips the hash, which is
 * how `benchmark:run` detects a stale fixture.
 *
 * Multi-file targets (a queue-level orchestrator that delegates to per-source
 * mappers in a subfolder) pass every file the fixture depends on. Files are
 * hashed in sorted-path order so the digest is independent of array order.
 */
export async function hashMapperFiles(mapperAbsolutePaths: readonly string[]): Promise<string> {
  if (mapperAbsolutePaths.length === 0) {
    throw new Error("hashMapperFiles requires at least one path")
  }
  const sorted = [...mapperAbsolutePaths].sort()
  const hash = createHash("sha256")
  for (const path of sorted) {
    const contents = await readFile(path)
    hash.update(path)
    hash.update("\0")
    hash.update(contents)
    hash.update("\0")
  }
  return hash.digest("hex")
}

export async function writeFixtureMeta(metaPath: string, meta: FixtureMeta): Promise<void> {
  await writeFile(metaPath, `${JSON.stringify(meta, null, 2)}\n`)
}

async function readFixtureMeta(metaPath: string): Promise<FixtureMeta | null> {
  try {
    await stat(metaPath)
  } catch {
    return null
  }
  const raw = await readFile(metaPath, "utf8")
  return JSON.parse(raw) as FixtureMeta
}

interface FreshnessCheck {
  readonly status: "fresh" | "stale" | "no-meta"
  readonly expectedHash: string
  readonly recordedHash?: string
}

export async function checkFixtureFreshness(metaPath: string, expectedHash: string): Promise<FreshnessCheck> {
  const meta = await readFixtureMeta(metaPath)
  if (meta === null) return { status: "no-meta", expectedHash }
  if (meta.mapperHash === expectedHash) return { status: "fresh", expectedHash, recordedHash: meta.mapperHash }
  return { status: "stale", expectedHash, recordedHash: meta.mapperHash }
}
