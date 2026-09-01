import { mkdtempSync, writeFileSync } from "node:fs"
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
    expect(await withLock(() => ++ran)).toBe(1)
    // Released, so the next run acquires it rather than skipping.
    expect(await withLock(() => ++ran)).toBe(2)
  })

  it("skips instead of running unlocked while another worker holds it", async () => {
    // An async Stop worker mid-upload when SessionEnd fires at quit. Proceeding here
    // would re-send the same deterministic spans before the offset advanced, and the
    // trace rollups are additive with no dedup.
    writeFileSync(join(dir, "state.lock"), "")
    let ran = 0
    let busy = 0

    const result = await withLock(
      () => ++ran,
      () => busy++,
    )

    expect(result).toBeUndefined()
    expect(ran).toBe(0)
    expect(busy).toBe(1)
  })

  it("breaks a lock left behind by a killed worker", async () => {
    const lock = join(dir, "state.lock")
    writeFileSync(lock, "")
    const ancient = new Date(Date.now() - 60 * 60_000)
    const { utimesSync } = await import("node:fs")
    utimesSync(lock, ancient, ancient)
    let ran = 0

    expect(await withLock(() => ++ran)).toBe(1)
    expect(ran).toBe(1)
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
