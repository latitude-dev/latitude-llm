import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs"
import { dirname, extname, join, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const scriptDir = dirname(fileURLToPath(import.meta.url))
const appDir = resolve(scriptDir, "..")
const outputServerDir = resolve(appDir, ".output/server")

function walk(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const entryPath = join(directory, entry.name)
    if (entry.isDirectory()) {
      walk(entryPath)
      continue
    }

    if (extname(entry.name) !== ".map" || !entry.name.endsWith(".mjs.map")) {
      continue
    }

    repairMap(entryPath)
  }
}

function repairMap(targetMapPath) {
  const targetMap = JSON.parse(readFileSync(targetMapPath, "utf8"))
  if (targetMap.mappings !== "" || targetMap.sources.length !== 1) {
    return
  }

  const [bridgeSource] = targetMap.sources
  if (typeof bridgeSource !== "string" || !bridgeSource.includes("node_modules/.nitro/vite/services/ssr/")) {
    return
  }

  const targetMapDir = dirname(targetMapPath)
  const assetFilePath = resolve(targetMapDir, bridgeSource)
  const assetMapPath = `${assetFilePath}.map`

  if (!statExists(assetMapPath)) {
    return
  }

  const assetMap = JSON.parse(readFileSync(assetMapPath, "utf8"))
  const assetMapDir = dirname(assetMapPath)

  const repairedMap = {
    ...assetMap,
    file: targetMap.file,
    sources: Array.isArray(assetMap.sources)
      ? assetMap.sources.map((source) => rewriteSourcePath(source, assetMapDir, targetMapDir))
      : assetMap.sources,
  }

  writeFileSync(targetMapPath, `${JSON.stringify(repairedMap)}\n`)
}

function rewriteSourcePath(source, assetMapDir, targetMapDir) {
  if (typeof source !== "string") {
    return source
  }

  if (source.startsWith("#") || source.includes("://") || source.startsWith("data:")) {
    return source
  }

  const absoluteSourcePath = resolve(assetMapDir, source)
  return relative(targetMapDir, absoluteSourcePath)
}

function statExists(path) {
  try {
    return statSync(path).isFile()
  } catch {
    return false
  }
}

walk(outputServerDir)
