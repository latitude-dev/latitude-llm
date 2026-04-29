import { describe, expect, it } from "vitest"
import { normalizeInstallFlags, normalizeUninstallFlags, parseFlags } from "./setup.ts"

describe("parseFlags", () => {
  it("returns the subcommand and a flat key/value map of --flags", () => {
    const { subcommand, flags } = parseFlags(["install", "--api-key=lat_xxx", "--yes"])
    expect(subcommand).toBe("install")
    expect(flags["api-key"]).toBe("lat_xxx")
    expect(flags.yes).toBe(true)
  })

  it("treats bare `--flag` as boolean true", () => {
    const { flags } = parseFlags(["install", "--no-content", "--no-trust", "--dry-run", "--restart"])
    expect(flags["no-content"]).toBe(true)
    expect(flags["no-trust"]).toBe(true)
    expect(flags["dry-run"]).toBe(true)
    expect(flags.restart).toBe(true)
  })

  it("ignores positional args after the subcommand", () => {
    const { flags } = parseFlags(["install", "extra-arg", "--yes"])
    expect(flags.yes).toBe(true)
  })

  it("supports `--key value` (space-separated) for known value-taking flags", () => {
    // Standard CLI convention — operators expect `--api-key lat_xxx`,
    // `--openclaw-dir /tmp/x`, and `--project foo` to work alongside the
    // `--key=value` form. Boolean flags are never consumed as values.
    const cases: Array<[string[], Record<string, unknown>]> = [
      [["install", "--api-key", "lat_xxx"], { "api-key": "lat_xxx" }],
      [["install", "--project", "my-proj"], { project: "my-proj" }],
      [["install", "--openclaw-dir", "/tmp/x"], { "openclaw-dir": "/tmp/x" }],
    ]
    for (const [argv, expected] of cases) {
      const { flags } = parseFlags(argv)
      for (const [k, v] of Object.entries(expected)) {
        expect(flags[k]).toBe(v)
      }
    }
  })

  it("doesn't consume an adjacent flag as a value (--no-content --yes stays two booleans)", () => {
    const { flags } = parseFlags(["install", "--no-content", "--yes"])
    expect(flags["no-content"]).toBe(true)
    expect(flags.yes).toBe(true)
  })

  it("treats a value-flag at end-of-argv (no following token) as boolean true", () => {
    // Defensive: if someone runs `--api-key` with no following value, we
    // don't crash trying to read undefined as the value — we just treat
    // it as a flag. Downstream `normalizeInstallFlags` then drops it
    // (boolean → not a string).
    const { flags } = parseFlags(["install", "--api-key"])
    expect(flags["api-key"]).toBe(true)
  })

  it("doesn't consume the next flag as the value of a value-taking flag (--api-key --project)", () => {
    // Edge case: `--api-key --project foo` should NOT bind --api-key to
    // "--project" as a literal string. The parser sees `--project` next
    // and treats `--api-key` as boolean true; `--project foo` then binds
    // normally.
    const { flags } = parseFlags(["install", "--api-key", "--project", "foo"])
    expect(flags["api-key"]).toBe(true)
    expect(flags.project).toBe("foo")
  })
})

describe("normalizeInstallFlags", () => {
  it("maps --staging to the staging environment", () => {
    const norm = normalizeInstallFlags({ staging: true })
    expect(norm.environment?.name).toBe("staging")
  })

  it("maps --dev to the local-dev environment", () => {
    const norm = normalizeInstallFlags({ dev: true })
    expect(norm.environment?.name).toBe("dev")
  })

  it("rejects --staging + --dev together", () => {
    expect(() => normalizeInstallFlags({ staging: true, dev: true })).toThrow(/mutually exclusive/)
  })

  it("derives allowConversationAccess tristate from --no-content / --allow-conversation", () => {
    expect(normalizeInstallFlags({ "no-content": true }).allowConversationAccess).toBe(false)
    expect(normalizeInstallFlags({ "allow-conversation": true }).allowConversationAccess).toBe(true)
    expect(normalizeInstallFlags({}).allowConversationAccess).toBeUndefined()
  })

  it("collapses --yes / --no-prompt into noPrompt", () => {
    expect(normalizeInstallFlags({ yes: true }).noPrompt).toBe(true)
    expect(normalizeInstallFlags({ "no-prompt": true }).noPrompt).toBe(true)
  })

  it("captures --openclaw-dir path", () => {
    expect(normalizeInstallFlags({ "openclaw-dir": "/tmp/x" }).openclawDir).toBe("/tmp/x")
  })

  it("derives restart mode from --restart / --no-restart with mutually-exclusive guard", () => {
    expect(normalizeInstallFlags({}).restart).toBe("auto")
    expect(normalizeInstallFlags({ restart: true }).restart).toBe("force")
    expect(normalizeInstallFlags({ "no-restart": true }).restart).toBe("never")
    expect(() => normalizeInstallFlags({ restart: true, "no-restart": true })).toThrow(/mutually exclusive/)
  })

  it("captures --dry-run as a boolean", () => {
    expect(normalizeInstallFlags({ "dry-run": true }).dryRun).toBe(true)
    expect(normalizeInstallFlags({}).dryRun).toBeFalsy()
  })
})

describe("normalizeUninstallFlags", () => {
  it("collapses --yes / --no-prompt into noPrompt", () => {
    expect(normalizeUninstallFlags({ yes: true }).noPrompt).toBe(true)
    expect(normalizeUninstallFlags({ "no-prompt": true }).noPrompt).toBe(true)
  })

  it("captures --openclaw-dir + --restart / --no-restart", () => {
    const f = normalizeUninstallFlags({ "openclaw-dir": "/tmp/x", "no-restart": true })
    expect(f.openclawDir).toBe("/tmp/x")
    expect(f.restart).toBe("never")
  })

  it("rejects --restart + --no-restart together", () => {
    expect(() => normalizeUninstallFlags({ restart: true, "no-restart": true })).toThrow(/mutually exclusive/)
  })
})
