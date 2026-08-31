import { describe, expect, it } from "vitest"
import {
  addLatitudeStopHook,
  type ClaudeSettings,
  hasLatitudeStopHook,
  latitudeStopHookCommand,
} from "./settings-file.ts"

const LATEST = "npx -y @latitude-data/claude-code-telemetry@latest"
const BARE = "npx -y @latitude-data/claude-code-telemetry"

function stopCommands(settings: ClaudeSettings): string[] {
  return (settings.hooks?.Stop ?? []).flatMap((g) => (g.hooks ?? []).map((h) => h.command ?? ""))
}

describe("addLatitudeStopHook", () => {
  it("adds a Latitude Stop hook when none exists", () => {
    const next = addLatitudeStopHook({}, LATEST)
    expect(stopCommands(next)).toEqual([LATEST])
    // Synchronous on purpose: Claude Code exits before spawning an async Stop hook
    // in headless mode, so an async hook emits nothing for `claude -p`.
    expect(next.hooks?.Stop?.[0]?.hooks[0]?.async).toBeUndefined()
  })

  it("upgrades an existing bare-npx hook to the new command", () => {
    const before: ClaudeSettings = {
      hooks: { Stop: [{ hooks: [{ type: "command", command: BARE, async: true }] }] },
    }
    const next = addLatitudeStopHook(before, LATEST)
    // Rewritten in place — not appended as a second hook.
    expect(stopCommands(next)).toEqual([LATEST])
  })

  it("upgrades a dev dist-path hook", () => {
    const before: ClaudeSettings = {
      hooks: {
        Stop: [{ hooks: [{ type: "command", command: "node /repo/packages/telemetry/claude-code/dist/index.js" }] }],
      },
    }
    const next = addLatitudeStopHook(before, LATEST)
    expect(stopCommands(next)).toEqual([LATEST])
    expect(next.hooks?.Stop?.[0]?.hooks[0]?.async).toBeUndefined()
  })

  it("strips async from a hook installed by an older version", () => {
    // Upgrade path for everyone already carrying the async hook: without this their
    // headless runs stay silent no matter how many times they reinstall.
    const before: ClaudeSettings = {
      hooks: { Stop: [{ hooks: [{ type: "command", command: LATEST, async: true }] }] },
    }
    const next = addLatitudeStopHook(before, LATEST)
    expect(next.hooks?.Stop?.[0]?.hooks[0]?.async).toBeUndefined()
  })

  it("leaves an already-current hook unchanged and does not duplicate", () => {
    const before: ClaudeSettings = {
      hooks: { Stop: [{ hooks: [{ type: "command", command: LATEST, async: true }] }] },
    }
    const next = addLatitudeStopHook(before, LATEST)
    expect(stopCommands(next)).toEqual([LATEST])
  })

  it("preserves unrelated Stop hooks and other hook events", () => {
    const before: ClaudeSettings = {
      hooks: {
        Stop: [{ hooks: [{ type: "command", command: "my-own-hook" }] }],
        PreToolUse: [{ hooks: [{ type: "command", command: "guard" }] }],
      },
    }
    const next = addLatitudeStopHook(before, LATEST)
    expect(stopCommands(next)).toEqual(["my-own-hook", LATEST])
    expect(next.hooks?.PreToolUse?.[0]?.hooks[0]?.command).toBe("guard")
  })
})

describe("latitudeStopHookCommand / hasLatitudeStopHook", () => {
  it("returns the existing Latitude command, or undefined when absent", () => {
    expect(latitudeStopHookCommand({})).toBeUndefined()
    expect(hasLatitudeStopHook({})).toBe(false)

    const withBare: ClaudeSettings = {
      hooks: { Stop: [{ hooks: [{ type: "command", command: BARE }] }] },
    }
    expect(latitudeStopHookCommand(withBare)).toBe(BARE)
    expect(hasLatitudeStopHook(withBare)).toBe(true)
  })
})
