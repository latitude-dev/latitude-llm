import { existsSync, mkdtempSync, readdirSync, readFileSync, utimesSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it, vi } from "vitest"
import { detachEnabled, detachSelf, isDetachedChild, readDetachedPayload } from "./detach.ts"
import { createLogger } from "./logger.ts"

const logger = createLogger(false)

// Payloads must land in a temp dir: the default is the user's real ~/.claude state,
// and a test run has no business writing there.
const baseEnv = (): NodeJS.ProcessEnv => ({
  LATITUDE_CLAUDE_CODE_PAYLOAD_DIR: mkdtempSync(join(tmpdir(), "latitude-detach-")),
})

function fakeSpawn() {
  const calls: Array<{ cmd: string; args: string[]; opts: Record<string, unknown> }> = []
  const unref = vi.fn()
  const fn = ((cmd: string, args: string[], opts: Record<string, unknown>) => {
    calls.push({ cmd, args, opts })
    return { pid: 4242, unref } as never
  }) as never
  return { fn, calls, unref }
}

describe("isDetachedChild", () => {
  it("is true only for the marker the parent sets", () => {
    expect(isDetachedChild({ LATITUDE_CLAUDE_CODE_DETACHED: "1" })).toBe(true)
    expect(isDetachedChild({})).toBe(false)
    expect(isDetachedChild({ LATITUDE_CLAUDE_CODE_DETACHED: "0" })).toBe(false)
  })
})

describe("detachEnabled", () => {
  it("defaults on and honours the opt-out", () => {
    expect(detachEnabled({})).toBe(true)
    expect(detachEnabled({ LATITUDE_CLAUDE_CODE_DETACH: "0" })).toBe(false)
  })
})

describe("detachSelf", () => {
  it("spawns a detached, stdio-less worker carrying the payload", () => {
    const spawned = fakeSpawn()
    const ok = detachSelf('{"session_id":"s1"}', logger, baseEnv(), spawned.fn)

    expect(ok).toBe(true)
    const call = spawned.calls[0]
    expect(call).toBeDefined()
    // setsid via `detached` is the whole point: it moves the worker out of the
    // session's process group so the session exiting cannot take it down.
    expect(call?.opts.detached).toBe(true)
    expect(call?.opts.stdio).toBe("ignore")
    expect(spawned.unref).toHaveBeenCalled()
  })

  it("marks the child so it does not detach again", () => {
    const spawned = fakeSpawn()
    detachSelf("{}", logger, baseEnv(), spawned.fn)
    const env = spawned.calls[0]?.opts.env as NodeJS.ProcessEnv

    expect(isDetachedChild(env)).toBe(true)
  })

  it("round-trips the payload to the child through a file", () => {
    const spawned = fakeSpawn()
    const raw = '{"session_id":"s1","transcript_path":"/tmp/t.jsonl"}'
    detachSelf(raw, logger, baseEnv(), spawned.fn)
    const env = spawned.calls[0]?.opts.env as NodeJS.ProcessEnv

    expect(readFileSync(env.LATITUDE_CLAUDE_CODE_PAYLOAD_FILE as string, "utf-8")).toBe(raw)
    expect(readDetachedPayload(env)).toBe(raw)
    // Consumed exactly once, so a killed child cannot leave it for a later run.
    expect(existsSync(env.LATITUDE_CLAUDE_CODE_PAYLOAD_FILE as string)).toBe(false)
    expect(readDetachedPayload(env)).toBe("")
  })

  it("runs inline instead when detaching is disabled", () => {
    const spawned = fakeSpawn()
    expect(detachSelf("{}", logger, { ...baseEnv(), LATITUDE_CLAUDE_CODE_DETACH: "0" }, spawned.fn)).toBe(false)
    expect(spawned.calls).toHaveLength(0)
  })

  it("runs inline instead when spawning throws", () => {
    const throwing = (() => {
      throw new Error("no fork for you")
    }) as never
    expect(detachSelf("{}", logger, baseEnv(), throwing)).toBe(false)
  })
})

describe("stale payload sweep", () => {
  it("removes payloads no worker will ever consume, and keeps recent ones", () => {
    const env = baseEnv()
    const dir = env.LATITUDE_CLAUDE_CODE_PAYLOAD_DIR as string
    const old = join(dir, "old.json")
    const fresh = join(dir, "fresh.json")
    writeFileSync(old, "{}")
    writeFileSync(fresh, "{}")
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60_000)
    utimesSync(old, twoHoursAgo, twoHoursAgo)

    detachSelf("{}", logger, env, fakeSpawn().fn)

    const left = readdirSync(dir)
    expect(left).toContain("fresh.json")
    expect(left).not.toContain("old.json")
  })
})

describe("readDetachedPayload", () => {
  it("is empty when no payload was handed over", () => {
    expect(readDetachedPayload({})).toBe("")
    expect(readDetachedPayload({ LATITUDE_CLAUDE_CODE_PAYLOAD_FILE: "/nonexistent/x.json" })).toBe("")
  })
})
