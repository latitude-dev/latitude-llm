import { mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { load, save, withLock } from "./state.ts"

let dir: string
const prior = process.env.LATITUDE_CLAUDE_CODE_STATE_DIR

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "latitude-state-"))
  process.env.LATITUDE_CLAUDE_CODE_STATE_DIR = dir
})

afterEach(() => {
  if (prior === undefined) delete process.env.LATITUDE_CLAUDE_CODE_STATE_DIR
  else process.env.LATITUDE_CLAUDE_CODE_STATE_DIR = prior
})

describe("withLock", () => {
  it("runs the callback and releases the lock", async () => {
    let ran = 0
    expect(await withLock("sess-a", () => ++ran)).toBe(1)
    // Released, so the next run acquires it rather than skipping.
    expect(await withLock("sess-a", () => ++ran)).toBe(2)
  })

  it("skips instead of running unlocked while another worker holds it", async () => {
    // An async Stop worker mid-upload when SessionEnd fires at quit. Proceeding here
    // would re-send the same deterministic spans before the offset advanced, and the
    // trace rollups are additive with no dedup.
    writeFileSync(join(dir, "sess-a.lock"), "999999")
    let ran = 0
    let busy = 0

    const result = await withLock(
      "sess-a",
      () => ++ran,
      () => busy++,
    )

    expect(result).toBeUndefined()
    expect(ran).toBe(0)
    expect(busy).toBe(1)
  })

  it("breaks a lock left behind by a killed worker", async () => {
    const lock = join(dir, "sess-a.lock")
    writeFileSync(lock, "")
    const ancient = new Date(Date.now() - 60 * 60_000)
    const { utimesSync } = await import("node:fs")
    utimesSync(lock, ancient, ancient)
    let ran = 0

    expect(await withLock("sess-a", () => ++ran)).toBe(1)
    expect(ran).toBe(1)
  })

  it("does not let one session's in-flight run block another's", async () => {
    // The lock is per session: a global one would let a busy session drop another's
    // SessionEnd, which is the last hook that session ever gets.
    writeFileSync(join(dir, "sess-a.lock"), "999999")
    let ran = 0

    expect(await withLock("sess-b", () => ++ran)).toBe(1)
    expect(ran).toBe(1)
  })

  it("does not remove a lock that was broken and retaken by another worker", async () => {
    // A batch slower than the stale window has its lock broken; unlinking by path
    // alone on release would delete the new holder's lock.
    const lock = join(dir, "sess-a.lock")
    await withLock("sess-a", () => {
      writeFileSync(lock, "999999")
    })

    expect(readFileSync(lock, "utf-8")).toBe("999999")
  })
})

describe("state round-trip", () => {
  it("persists and reloads the inherited-trace bookkeeping", () => {
    save("k", { offset: 10, buffer: "", turnCount: 2, inheritedTraceId: "t".repeat(32), inheritedSpanCount: 7 })
    const back = load("k")

    expect(back.inheritedTraceId).toBe("t".repeat(32))
    expect(back.inheritedSpanCount).toBe(7)
    expect(back.turnCount).toBe(2)
  })

  it("returns an empty entry for an unknown key", () => {
    expect(load("nope")).toEqual({ offset: 0, buffer: "", turnCount: 0 })
  })
})
