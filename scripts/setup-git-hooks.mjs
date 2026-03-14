#!/usr/bin/env node

import { spawnSync } from "node:child_process"
import { chmod } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const preCommitHookPath = resolve(rootDir, ".husky/pre-commit")

const runGit = (args) =>
  spawnSync("git", args, {
    cwd: rootDir,
    stdio: "pipe",
    encoding: "utf8",
  })

const hasGit =
  spawnSync("git", ["--version"], {
    cwd: rootDir,
    stdio: "ignore",
  }).status === 0

if (!hasGit) {
  console.log("Skipping git hook setup: git is not available.")
  process.exit(0)
}

if (runGit(["rev-parse", "--git-dir"]).status !== 0) {
  console.log("Skipping git hook setup: not a git checkout.")
  process.exit(0)
}

const setHooksPath = runGit(["config", "--local", "core.hooksPath", ".husky"])

if (setHooksPath.status !== 0) {
  const message = setHooksPath.stderr.trim() || "Failed to configure core.hooksPath."
  console.error(message)
  process.exit(setHooksPath.status ?? 1)
}

try {
  await chmod(preCommitHookPath, 0o755)
} catch (error) {
  console.error(`Failed to mark hook executable: ${preCommitHookPath}`)
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}

console.log("Configured local git hooks at .husky")
