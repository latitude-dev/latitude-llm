import { describe, expect, it } from "vitest"
import {
  addLatitudeHooks,
  type ClaudeSettings,
  hasLatitudeStopHook,
  latitudeStopHookCommand,
  removeLatitudeHooks,
} from "./settings-file.ts"

const LATEST = "npx -y @latitude-data/claude-code-telemetry@latest"
const BARE = "npx -y @latitude-data/claude-code-telemetry"

function stopCommands(settings: ClaudeSettings): string[] {
  return (settings.hooks?.Stop ?? []).flatMap((g) => (g.hooks ?? []).map((h) => h.command ?? ""))
}

describe("addLatitudeHooks", () => {
  it("adds a Latitude Stop hook when none exists", () => {
    const next = addLatitudeHooks({}, LATEST)
    expect(stopCommands(next)).toEqual([LATEST])
    // Stop stays async so an interactive turn is never blocked; SessionEnd is
    // synchronous because it is the only one that fires for `claude -p`.
    expect(next.hooks?.Stop?.[0]?.hooks[0]?.async).toBe(true)
    expect(next.hooks?.SessionEnd?.[0]?.hooks[0]?.command).toBe(LATEST)
    expect(next.hooks?.SessionEnd?.[0]?.hooks[0]?.async).toBeUndefined()
  })

  it("upgrades an existing bare-npx hook to the new command", () => {
    const before: ClaudeSettings = {
      hooks: { Stop: [{ hooks: [{ type: "command", command: BARE, async: true }] }] },
    }
    const next = addLatitudeHooks(before, LATEST)
    // Rewritten in place — not appended as a second hook.
    expect(stopCommands(next)).toEqual([LATEST])
  })

  it("upgrades a dev dist-path hook", () => {
    const before: ClaudeSettings = {
      hooks: {
        Stop: [{ hooks: [{ type: "command", command: "node /repo/packages/telemetry/claude-code/dist/index.js" }] }],
      },
    }
    const next = addLatitudeHooks(before, LATEST)
    expect(stopCommands(next)).toEqual([LATEST])
    expect(next.hooks?.Stop?.[0]?.hooks[0]?.async).toBe(true)
  })

  it("adds the SessionEnd hook to a settings file that only has the older Stop hook", () => {
    // The upgrade path for every existing install: without SessionEnd their headless
    // runs stay silent no matter how many times they reinstall.
    const before: ClaudeSettings = {
      hooks: { Stop: [{ hooks: [{ type: "command", command: LATEST, async: true }] }] },
    }
    const next = addLatitudeHooks(before, LATEST)
    expect(next.hooks?.Stop?.[0]?.hooks).toHaveLength(1)
    expect(next.hooks?.SessionEnd?.[0]?.hooks[0]?.command).toBe(LATEST)
  })

  it("preserves a foreign SessionEnd hook", () => {
    const before: ClaudeSettings = {
      hooks: { SessionEnd: [{ hooks: [{ type: "command", command: "/usr/local/bin/my-own-thing" }] }] },
    }
    const next = addLatitudeHooks(before, LATEST)
    const commands = (next.hooks?.SessionEnd ?? []).flatMap((g) => g.hooks.map((h) => h.command))
    expect(commands).toContain("/usr/local/bin/my-own-thing")
    expect(commands).toContain(LATEST)
  })

  it("leaves an already-current hook unchanged and does not duplicate", () => {
    const before: ClaudeSettings = {
      hooks: { Stop: [{ hooks: [{ type: "command", command: LATEST, async: true }] }] },
    }
    const next = addLatitudeHooks(before, LATEST)
    expect(stopCommands(next)).toEqual([LATEST])
  })

  it("preserves unrelated Stop hooks and other hook events", () => {
    const before: ClaudeSettings = {
      hooks: {
        Stop: [{ hooks: [{ type: "command", command: "my-own-hook" }] }],
        PreToolUse: [{ hooks: [{ type: "command", command: "guard" }] }],
      },
    }
    const next = addLatitudeHooks(before, LATEST)
    expect(stopCommands(next)).toEqual(["my-own-hook", LATEST])
    expect(next.hooks?.PreToolUse?.[0]?.hooks[0]?.command).toBe("guard")
  })
})

describe("removeLatitudeHooks", () => {
  it("removes the Latitude hook from both events and leaves foreign hooks alone", () => {
    const before: ClaudeSettings = {
      hooks: {
        Stop: [
          {
            hooks: [
              { type: "command", command: LATEST, async: true },
              { type: "command", command: "/other" },
            ],
          },
        ],
        SessionEnd: [{ hooks: [{ type: "command", command: LATEST }] }],
      },
    }
    const next = removeLatitudeHooks(before)

    expect(stopCommands(next)).toEqual(["/other"])
    // The whole event key goes away once nothing of ours is left in it.
    expect(next.hooks?.SessionEnd).toBeUndefined()
  })

  it("drops the hooks key entirely when nothing else remains", () => {
    const before: ClaudeSettings = {
      hooks: {
        Stop: [{ hooks: [{ type: "command", command: LATEST, async: true }] }],
        SessionEnd: [{ hooks: [{ type: "command", command: LATEST }] }],
      },
    }
    expect(removeLatitudeHooks(before).hooks).toBeUndefined()
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
