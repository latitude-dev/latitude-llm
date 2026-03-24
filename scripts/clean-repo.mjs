#!/usr/bin/env node

import { readdir, rm } from "node:fs/promises"
import { dirname, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const removableDirectoryNames = new Set(["dist", "node_modules", ".turbo"])
const removedDirectories = []

async function deleteMatchingDirectories(directoryPath) {
  const entries = await readdir(directoryPath, { withFileTypes: true })

  for (const entry of entries) {
    if (!entry.isDirectory()) continue

    const entryPath = resolve(directoryPath, entry.name)

    if (removableDirectoryNames.has(entry.name)) {
      await rm(entryPath, { recursive: true, force: true })
      removedDirectories.push(relative(rootDir, entryPath) || entry.name)
      continue
    }

    await deleteMatchingDirectories(entryPath)
  }
}

await deleteMatchingDirectories(rootDir)

if (removedDirectories.length === 0) {
  console.log("No dist/, node_modules/, or .turbo/ directories found.")
  process.exit(0)
}

removedDirectories.sort()

for (const directory of removedDirectories) {
  console.log(`Removed ${directory}`)
}

console.log(`Removed ${removedDirectories.length} directories.`)
