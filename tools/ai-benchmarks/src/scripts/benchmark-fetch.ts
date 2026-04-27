import { mkdir, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { hashMapperFile, writeFixtureMeta } from "../runner/stale.ts"
import { TARGETS, TARGETS_BY_ID, targetPath } from "../runner/targets.ts"

// CLI entry: `pnpm --filter @tools/ai-benchmarks benchmark:fetch <target-id>`
//
// Downloads upstream dataset files into the local cache, maps them to
// `FixtureRow[]`, and writes `fixtures/<target-path>.jsonl` plus a sidecar
// `.meta.json` recording the mapper file's hash — `benchmark:run` uses the
// sidecar to detect stale fixtures.

const FIXTURES_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "fixtures")

function usage(): never {
  const known = TARGETS.map((t) => t.id).join(", ")
  console.error(`usage: pnpm --filter @tools/ai-benchmarks benchmark:fetch <target-id>\nknown: ${known}`)
  process.exit(1)
}

async function main(): Promise<void> {
  const id = process.argv[2]
  if (!id) usage()
  const target = TARGETS_BY_ID.get(id)
  if (!target) {
    console.error(`unknown target "${id}"`)
    usage()
  }

  console.log(`fetching benchmarks for ${target.id}...`)
  const rows = await target.mapper()

  const base = join(FIXTURES_ROOT, targetPath(target.id))
  const jsonlPath = `${base}.jsonl`
  const metaPath = `${base}.meta.json`
  await mkdir(dirname(jsonlPath), { recursive: true })

  const jsonl = `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`
  await writeFile(jsonlPath, jsonl)

  const mapperHash = await hashMapperFile(target.mapperSourcePath)
  await writeFixtureMeta(metaPath, { mapperHash, generatedAt: new Date().toISOString() })

  const positives = rows.filter((r) => r.expected.matched).length
  const negatives = rows.length - positives
  console.log(`wrote ${rows.length} rows → ${jsonlPath}`)
  console.log(`  ${positives} positives, ${negatives} negatives`)
  console.log(`  meta → ${metaPath}`)
}

await main()
