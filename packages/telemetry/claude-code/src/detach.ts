// Claude Code backgrounds an `async` Stop hook and tears it down when the session
// process exits. Interactive sessions outlive the hook so it finishes, but a headless
// run (`claude -p`) exits the moment the answer is printed and the hook is killed
// before it can read the transcript and POST — so headless sessions emitted nothing.
//
// Re-spawning ourselves with `detached: true` puts the real work in its own process
// group (setsid), which no longer dies with the session. The first process returns
// immediately, so interactive turns keep their snappy hook and headless turns still
// ship. The payload travels through a file because stdin is already consumed and the
// child's stdio is closed.

import { spawn } from "node:child_process"
import { mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import type { Logger } from "./logger.ts"

const DETACHED_ENV = "LATITUDE_CLAUDE_CODE_DETACHED"
const PAYLOAD_ENV = "LATITUDE_CLAUDE_CODE_PAYLOAD_FILE"
const PAYLOAD_DIR_ENV = "LATITUDE_CLAUDE_CODE_PAYLOAD_DIR"
// The payload directory is user-configurable and may be shared, so every file we
// write carries this prefix and the sweep below only ever removes its own.
const PAYLOAD_PREFIX = "latitude-payload-"

function payloadDir(env: NodeJS.ProcessEnv): string {
  return env[PAYLOAD_DIR_ENV] || join(homedir(), ".claude", "state", "latitude", "payloads")
}

export function isDetachedChild(env: NodeJS.ProcessEnv = process.env): boolean {
  return env[DETACHED_ENV] === "1"
}

export function detachEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return (env.LATITUDE_CLAUDE_CODE_DETACH ?? "1") !== "0"
}

// Reads the payload the parent left for us and removes it, so a child killed later
// cannot leave the file behind for a subsequent run to pick up.
export function readDetachedPayload(env: NodeJS.ProcessEnv = process.env): string {
  const path = env[PAYLOAD_ENV]
  if (!path) return ""
  try {
    const raw = readFileSync(path, "utf-8")
    rmSync(path, { force: true })
    return raw
  } catch {
    return ""
  }
}

// A worker killed before it consumed its payload leaves the file behind, in the
// user's home directory, forever. Nothing else ever reads a payload this old.
const PAYLOAD_TTL_MS = 60 * 60_000

function sweepStalePayloads(dir: string): void {
  try {
    const cutoff = Date.now() - PAYLOAD_TTL_MS
    for (const name of readdirSync(dir)) {
      if (!name.startsWith(PAYLOAD_PREFIX) || !name.endsWith(".json")) continue
      const path = join(dir, name)
      try {
        if (statSync(path).mtimeMs < cutoff) rmSync(path, { force: true })
      } catch {
        // vanished under us, or not ours to remove
      }
    }
  } catch {
    // best-effort
  }
}

// Returns true when the work has been handed to a detached child and this process
// should exit. False means detaching was unavailable and the caller must run inline.
export function detachSelf(
  raw: string,
  logger: Logger,
  env: NodeJS.ProcessEnv = process.env,
  spawnFn: typeof spawn = spawn,
): boolean {
  if (!detachEnabled(env)) return false
  try {
    const selfPath = fileURLToPath(new URL("./index.js", import.meta.url))
    const dir = payloadDir(env)
    mkdirSync(dir, { recursive: true })
    sweepStalePayloads(dir)
    const payloadPath = join(dir, `${PAYLOAD_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 10)}.json`)
    writeFileSync(payloadPath, raw, "utf-8")

    const child = spawnFn(process.execPath, [selfPath], {
      detached: true,
      stdio: "ignore",
      // Without this a detached child pops a console window on Windows.
      windowsHide: true,
      env: { ...env, [DETACHED_ENV]: "1", [PAYLOAD_ENV]: payloadPath },
    })
    child.unref()
    logger.debug(`detached hook worker pid=${child.pid ?? "unknown"} payload=${payloadPath}`)
    return true
  } catch (err) {
    logger.debug(`detach failed, running inline: ${String(err)}`)
    return false
  }
}
