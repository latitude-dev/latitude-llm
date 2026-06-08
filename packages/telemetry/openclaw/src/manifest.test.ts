import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

/**
 * Guards `openclaw.plugin.json`'s `configSchema`.
 *
 * Regression for the install/upgrade breakage on OpenClaw 2026.5+: when
 * `openclaw plugins install <spec> --force` runs, OpenClaw (re)creates the
 * `plugins.entries[id]` block with an empty `config` and validates the whole
 * config against each plugin's `configSchema` *during* the install — before
 * the installer CLI gets to layer credentials in (`setup.ts` step 3). If the
 * schema marks `apiKey` / `project` as `required`, that transient configless
 * entry fails validation and the install aborts with
 * `must have required property 'apiKey'` — even when re-configuring an entry
 * that already had valid credentials on disk.
 *
 * The runtime already self-disables when creds are absent
 * (`loadConfig` → `enabled: hasCreds && !explicitlyDisabled`), so marking them
 * `required` buys nothing and breaks the installer. Keep them non-required.
 */
describe("openclaw.plugin.json configSchema", () => {
  const here = dirname(fileURLToPath(import.meta.url))
  const manifest = JSON.parse(readFileSync(join(here, "..", "openclaw.plugin.json"), "utf-8")) as {
    configSchema?: { required?: string[]; additionalProperties?: boolean }
  }

  it("does not mark apiKey or project as required (would break install/upgrade on OpenClaw 2026.5+)", () => {
    const required = manifest.configSchema?.required ?? []
    expect(required).not.toContain("apiKey")
    expect(required).not.toContain("project")
  })

  it("accepts an empty config object (the configless entry openclaw plugins install creates)", () => {
    // additionalProperties:true + no required ⇒ {} is valid. We assert the two
    // properties that make {} valid so a future tightening trips this test.
    expect(manifest.configSchema?.additionalProperties).toBe(true)
    expect(manifest.configSchema?.required ?? []).toEqual([])
  })
})
