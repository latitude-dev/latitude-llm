#!/usr/bin/env node

/**
 * Keeps `docs/telemetry/typescript-changelog.md` in sync with
 * `packages/telemetry/typescript/CHANGELOG.md` (single source of truth for release notes).
 *
 * Usage:
 *   node ./scripts/sync-telemetry-typescript-changelog.mjs           — write docs file
 *   node ./scripts/sync-telemetry-typescript-changelog.mjs --check  — exit 1 if out of sync
 */

import { readFile, writeFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const sourcePath = resolve(rootDir, "packages/telemetry/typescript/CHANGELOG.md")
const destPath = resolve(rootDir, "docs/telemetry/typescript-changelog.md")

const docFrontmatter = `---
title: TypeScript SDK changelog
description: Release history and migration notes for @latitude-data/telemetry.
---

{/* Synced from packages/telemetry/typescript/CHANGELOG.md via pnpm docs:sync-telemetry-changelog */}

`

function normalizeNewlines(s) {
  return s.replace(/\r\n/g, "\n")
}

const checkOnly = process.argv.includes("--check")

const sourceBody = normalizeNewlines(await readFile(sourcePath, "utf8"))
const expected = docFrontmatter + sourceBody

if (checkOnly) {
  let actual
  try {
    actual = normalizeNewlines(await readFile(destPath, "utf8"))
  } catch {
    console.error(`Missing ${destPath}; run: pnpm docs:sync-telemetry-changelog`)
    process.exit(1)
  }
  if (actual !== expected) {
    console.error(
      "docs/telemetry/typescript-changelog.md is out of sync with packages/telemetry/typescript/CHANGELOG.md.\nRun: pnpm docs:sync-telemetry-changelog",
    )
    process.exit(1)
  }
  process.exit(0)
}

await writeFile(destPath, expected, "utf8")
console.log(`Wrote ${destPath}`)
