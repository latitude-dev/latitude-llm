import { createHash } from "node:crypto"
import { readFile, stat, writeFile } from "node:fs/promises"

interface FixtureMeta {
  readonly mapperHash: string
  readonly generatedAt: string
}

/**
 * Hash the mapper source file. Any change in the mapper's code — swapping
 * sources, bumping a pinned SHA, tweaking the label rule — flips the hash,
 * which is how `benchmark:run` detects a stale fixture.
 */
export async function hashMapperFile(mapperAbsolutePath: string): Promise<string> {
  const contents = await readFile(mapperAbsolutePath)
  return createHash("sha256").update(contents).digest("hex")
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
