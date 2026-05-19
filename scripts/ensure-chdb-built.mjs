#!/usr/bin/env node
import { existsSync, mkdirSync, rmSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { createRequire } from "node:module"
import { spawnSync } from "node:child_process"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const require = createRequire(import.meta.url)

const packageJsonPath = require.resolve("chdb/package.json", {
  paths: [resolve(root, "packages/platform/testkit")],
})
const packageDir = dirname(packageJsonPath)
const nativeBindingPath = resolve(packageDir, "build/Release/chdb_node.node")
const lockPath = resolve(packageDir, ".latitude-chdb-build.lock")

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

if (existsSync(nativeBindingPath)) {
  process.exit(0)
}

let ownsLock = false
while (!ownsLock) {
  try {
    mkdirSync(lockPath)
    ownsLock = true
  } catch {
    if (existsSync(nativeBindingPath)) process.exit(0)
    sleep(500)
  }
}

let status = 0
try {
  if (!existsSync(nativeBindingPath)) {
    console.log("Building chdb native bindings for ClickHouse tests...")
    const result = spawnSync("npm", ["run", "install"], {
      cwd: packageDir,
      stdio: "inherit",
      env: process.env,
    })

    status = result.status ?? 1
  }
} finally {
  rmSync(lockPath, { force: true, recursive: true })
}

process.exit(status)
