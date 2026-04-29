// datadog-ci `sourcemaps upload` only globs **/*.js, so it never picks up the
// `.mjs` files that nitro emits and that node actually loads at runtime. Without
// records keyed at `.mjs` paths Datadog can't symbolicate frames from the
// running process. This script uploads each `.mjs.map` directly via the
// /api/v2/srcmap intake using the same multipart shape datadog-ci uses
// (event + source_map + minified_file).

import { readFile, readdir, stat } from "node:fs/promises"
import { join, relative } from "node:path"

const { DATADOG_API_KEY, DATADOG_SITE = "datadoghq.com", DD_GIT_REPOSITORY_URL, DD_GIT_COMMIT_SHA } = process.env

if (!DATADOG_API_KEY) {
  console.error("DATADOG_API_KEY is required")
  process.exit(1)
}

const [, , inputDir, service, version, minifiedPathPrefix] = process.argv
if (!inputDir || !service || !version || !minifiedPathPrefix) {
  console.error("Usage: upload-mjs-sourcemaps.mjs <input-dir> <service> <version> <minified-path-prefix>")
  process.exit(1)
}

const intakeUrl = `https://sourcemap-intake.${DATADOG_SITE}/api/v2/srcmap`
const normalizedPrefix = minifiedPathPrefix.replace(/\/$/, "")

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) yield* walk(path)
    else yield path
  }
}

async function uploadSourcemap(sourcemapPath) {
  const minifiedPath = sourcemapPath.slice(0, -".map".length)
  try {
    await stat(minifiedPath)
  } catch {
    console.warn(`skip ${sourcemapPath}: minified file ${minifiedPath} not found`)
    return "skip"
  }

  const minifiedUrl = `${normalizedPrefix}/${relative(inputDir, minifiedPath)}`

  const metadata = {
    cli_version: "custom-mjs-uploader",
    minified_url: minifiedUrl,
    service,
    type: "js_sourcemap",
    version,
    ...(DD_GIT_REPOSITORY_URL ? { git_repository_url: DD_GIT_REPOSITORY_URL } : {}),
    ...(DD_GIT_COMMIT_SHA ? { git_commit_sha: DD_GIT_COMMIT_SHA } : {}),
  }

  const [sourcemapBuffer, minifiedBuffer] = await Promise.all([readFile(sourcemapPath), readFile(minifiedPath)])

  const formData = new FormData()
  formData.append("event", new Blob([JSON.stringify(metadata)], { type: "application/json" }), "event")
  formData.append("source_map", new Blob([sourcemapBuffer], { type: "application/octet-stream" }), "source_map")
  formData.append("minified_file", new Blob([minifiedBuffer], { type: "application/octet-stream" }), "minified_file")

  const response = await fetch(intakeUrl, {
    method: "POST",
    headers: { "DD-API-KEY": DATADOG_API_KEY },
    body: formData,
  })

  if (!response.ok) {
    const body = await response.text().catch(() => "")
    console.error(`FAIL ${response.status} ${minifiedUrl}: ${body}`)
    return "fail"
  }

  console.log(`OK ${minifiedUrl}`)
  return "ok"
}

const counts = { ok: 0, fail: 0, skip: 0 }
const tasks = []
for await (const path of walk(inputDir)) {
  if (path.endsWith(".mjs.map")) tasks.push(uploadSourcemap(path))
}

const results = await Promise.all(tasks)
for (const r of results) counts[r]++
console.log(`Done: ${counts.ok} uploaded, ${counts.skip} skipped, ${counts.fail} failed`)
if (counts.fail > 0) process.exit(1)
