import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { pathsFor, resolveConfigDir } from "./config-dir.ts"

describe("resolveConfigDir", () => {
  let tmpRoot: string
  let cwd: string
  let home: string

  beforeEach(() => {
    tmpRoot = mkdtempSync(join(tmpdir(), "openclaw-cli-cfgdir-"))
    cwd = join(tmpRoot, "cwd")
    home = join(tmpRoot, "home")
    mkdirSync(cwd, { recursive: true })
    mkdirSync(home, { recursive: true })
  })

  afterEach(() => {
    rmSync(tmpRoot, { recursive: true, force: true })
  })

  it("uses --openclaw-dir flag first when provided", () => {
    const explicit = join(tmpRoot, "explicit")
    mkdirSync(explicit)
    // Even with cwd having an openclaw.json, the flag wins.
    writeFileSync(join(cwd, "openclaw.json"), "{}")
    const r = resolveConfigDir({ flag: explicit, env: "/env-set", cwd, home })
    expect(r.dir).toBe(explicit)
    expect(r.source).toBe("flag")
  })

  it("resolves --openclaw-dir relative paths against cwd", () => {
    const r = resolveConfigDir({ flag: "./relative", cwd, home })
    expect(r.dir).toBe(join(cwd, "relative"))
    expect(r.source).toBe("flag")
  })

  it("falls back to OPENCLAW_HOME env when no flag", () => {
    const envDir = join(tmpRoot, "env-home")
    const r = resolveConfigDir({ env: envDir, cwd, home })
    expect(r.dir).toBe(envDir)
    expect(r.source).toBe("env")
  })

  it("auto-detects ./openclaw.json in cwd when no flag/env", () => {
    writeFileSync(join(cwd, "openclaw.json"), "{}")
    const r = resolveConfigDir({ env: "", cwd, home })
    expect(r.dir).toBe(cwd)
    expect(r.source).toBe("cwd")
  })

  it("falls back to ~/.openclaw when nothing else matches", () => {
    const r = resolveConfigDir({ env: "", cwd, home })
    expect(r.dir).toBe(join(home, ".openclaw"))
    expect(r.source).toBe("default")
  })

  it("treats empty-string flag as absent (so it doesn't shadow env/cwd/home)", () => {
    const envDir = join(tmpRoot, "env-home")
    const r = resolveConfigDir({ flag: "", env: envDir, cwd, home })
    expect(r.source).toBe("env")
  })
})

describe("pathsFor", () => {
  it("derives all four well-known paths from a config dir", () => {
    const p = pathsFor("/foo/bar")
    expect(p.configDir).toBe("/foo/bar")
    expect(p.settingsPath).toBe("/foo/bar/openclaw.json")
    expect(p.settingsBackupPath).toBe("/foo/bar/openclaw.json.latitude-bak")
    // installs.json sits under <configDir>/plugins/, not the root.
    expect(p.installsPath).toBe("/foo/bar/plugins/installs.json")
  })
})
