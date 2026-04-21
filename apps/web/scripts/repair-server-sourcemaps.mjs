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

    if (entry.name.endsWith(".mjs")) {
      createJsModuleAlias(entryPath)
      continue
    }

    if (extname(entry.name) === ".map" && entry.name.endsWith(".mjs.map")) {
      repairMap(entryPath)
      hydrateMapSourcesContent(entryPath)
      createJsMapAlias(entryPath)
    }
  }
}

function hydrateMapSourcesContent(targetMapPath) {
  const targetMap = JSON.parse(readFileSync(targetMapPath, "utf8"))
  if (!Array.isArray(targetMap.sources)) {
    return
  }

  const targetMapDir = dirname(targetMapPath)
  const existingSourcesContent = Array.isArray(targetMap.sourcesContent) ? targetMap.sourcesContent : []
  let didChange = !Array.isArray(targetMap.sourcesContent) || existingSourcesContent.length !== targetMap.sources.length

  const sourcesContent = targetMap.sources.map((source, index) => {
    const existing = existingSourcesContent[index]
    if (typeof existing === "string") {
      return existing
    }

    const absoluteSourcePath = resolveSourcePath(source, targetMapDir)
    if (!absoluteSourcePath || !statExists(absoluteSourcePath)) {
      return existing ?? null
    }

    didChange = true
    return readFileSync(absoluteSourcePath, "utf8")
  })

  if (!didChange) {
    return
  }

  const hydratedMap = {
    ...targetMap,
    sourcesContent,
  }

  writeFileSync(targetMapPath, `${JSON.stringify(hydratedMap)}\n`)
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
  const absoluteSourcePath = resolveSourcePath(source, assetMapDir)
  if (!absoluteSourcePath) {
    return source
  }

  return relative(targetMapDir, absoluteSourcePath)
}

function resolveSourcePath(source, sourceMapDir) {
  if (typeof source !== "string") {
    return null
  }

  if (source.startsWith("#") || source.includes("://") || source.startsWith("data:")) {
    return null
  }

  return resolve(sourceMapDir, source)
}

function createJsModuleAlias(targetModulePath) {
  const aliasPath = targetModulePath.slice(0, -4) + ".js"
  const moduleContents = readFileSync(targetModulePath, "utf8")
  const aliasedContents = moduleContents.replace(/\.mjs\.map$/m, ".js.map")
  writeFileSync(aliasPath, aliasedContents)
}

function createJsMapAlias(targetMapPath) {
  const aliasPath = targetMapPath.slice(0, -8) + ".js.map"
  const targetMap = JSON.parse(readFileSync(targetMapPath, "utf8"))
  const aliasedMap = {
    ...targetMap,
    file: typeof targetMap.file === "string" ? targetMap.file.replace(/\.mjs$/, ".js") : targetMap.file,
  }
  writeFileSync(aliasPath, `${JSON.stringify(aliasedMap)}\n`)
}

function statExists(path) {
  try {
    return statSync(path).isFile()
  } catch {
    return false
  }
}

walk(outputServerDir)
