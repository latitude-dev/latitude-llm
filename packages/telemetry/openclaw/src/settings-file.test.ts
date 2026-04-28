import { describe, expect, it } from "vitest"
import {
  addToPluginsAllow,
  migrateLegacyEntries,
  type OpenClawSettings,
  PLUGIN_ID,
  removeFromPluginsAllow,
  removePluginEntry,
  setPluginEntry,
} from "./settings-file.ts"

describe("setPluginEntry", () => {
  it("writes credentials under .config and dispatch gate under .hooks (mirrored)", () => {
    const settings: OpenClawSettings = {}
    setPluginEntry(settings, {
      apiKey: "k",
      project: "p",
      baseUrl: "https://staging-ingest.latitude.so",
      allowConversationAccess: true,
      debug: false,
    })

    const entry = settings.plugins?.entries?.[PLUGIN_ID]
    expect(entry?.enabled).toBe(true)
    expect(entry?.config?.apiKey).toBe("k")
    expect(entry?.config?.project).toBe("p")
    expect(entry?.config?.baseUrl).toBe("https://staging-ingest.latitude.so")
    expect(entry?.config?.allowConversationAccess).toBe(true)
    // Hooks block must mirror config — that's what gates dispatch on
    // OpenClaw 2026.4.25+.
    expect(entry?.hooks?.allowConversationAccess).toBe(true)
    // We don't write to top-level `env` (root schema rejects arbitrary keys).
    expect((settings as { env?: unknown }).env).toBeUndefined()
  })

  it("mirrors allowConversationAccess: false into both config and hooks", () => {
    const settings: OpenClawSettings = {}
    setPluginEntry(settings, {
      apiKey: "k",
      project: "p",
      baseUrl: undefined,
      allowConversationAccess: false,
    })
    const entry = settings.plugins?.entries?.[PLUGIN_ID]
    expect(entry?.config?.allowConversationAccess).toBe(false)
    expect(entry?.hooks?.allowConversationAccess).toBe(false)
  })

  it("clears baseUrl when undefined (production install after a staging install)", () => {
    const settings: OpenClawSettings = {
      plugins: {
        entries: {
          [PLUGIN_ID]: {
            enabled: true,
            config: { apiKey: "old-k", project: "old-p", baseUrl: "https://staging-ingest.latitude.so" },
          },
        },
      },
    }
    setPluginEntry(settings, { apiKey: "new-k", project: "new-p", baseUrl: undefined })
    const config = settings.plugins?.entries?.[PLUGIN_ID]?.config
    expect(config?.baseUrl).toBeUndefined()
    expect(config?.apiKey).toBe("new-k")
  })

  it("preserves unrelated fields on the existing plugin entry", () => {
    const settings: OpenClawSettings = {
      plugins: {
        entries: {
          [PLUGIN_ID]: {
            enabled: true,
            subagent: { allowModelOverride: true },
            config: { customField: "keep me" },
          },
        },
      },
    }
    setPluginEntry(settings, { apiKey: "k", project: "p", baseUrl: undefined })
    const entry = settings.plugins?.entries?.[PLUGIN_ID] as {
      subagent?: { allowModelOverride?: boolean }
      config?: Record<string, unknown>
    }
    expect(entry.subagent?.allowModelOverride).toBe(true)
    expect(entry.config?.customField).toBe("keep me")
    expect(entry.config?.apiKey).toBe("k")
  })

  it("preserves an existing hooks.allowPromptInjection alongside the new allowConversationAccess", () => {
    const settings: OpenClawSettings = {
      plugins: {
        entries: {
          [PLUGIN_ID]: {
            hooks: { allowPromptInjection: true },
            config: { apiKey: "old", project: "old" },
          },
        },
      },
    }
    setPluginEntry(settings, { apiKey: "new", project: "new", baseUrl: undefined })
    const hooks = settings.plugins?.entries?.[PLUGIN_ID]?.hooks
    expect(hooks?.allowPromptInjection).toBe(true)
    expect(hooks?.allowConversationAccess).toBe(true)
  })

  it("preserves a hand-edited `enabled: false` across re-installs", () => {
    const settings: OpenClawSettings = {
      plugins: {
        entries: {
          [PLUGIN_ID]: {
            enabled: false,
            config: { apiKey: "old", project: "old" },
          },
        },
      },
    }
    setPluginEntry(settings, { apiKey: "new", project: "new", baseUrl: undefined })
    const entry = settings.plugins?.entries?.[PLUGIN_ID]
    // Paused plugin stays paused — operator's intent wins.
    expect(entry?.enabled).toBe(false)
    expect((entry?.config as Record<string, unknown>)?.apiKey).toBe("new")
  })

  it("defaults to enabled=true for a fresh install (no existing entry)", () => {
    const settings: OpenClawSettings = {}
    setPluginEntry(settings, { apiKey: "k", project: "p", baseUrl: undefined })
    expect(settings.plugins?.entries?.[PLUGIN_ID]?.enabled).toBe(true)
  })

  it("explicitly setting enabled overrides existing", () => {
    const settings: OpenClawSettings = {
      plugins: { entries: { [PLUGIN_ID]: { enabled: false } } },
    }
    setPluginEntry(settings, { apiKey: "k", project: "p", baseUrl: undefined, enabled: true })
    expect(settings.plugins?.entries?.[PLUGIN_ID]?.enabled).toBe(true)
  })

  it("preserves existing debug when not overridden", () => {
    const settings: OpenClawSettings = {
      plugins: {
        entries: { [PLUGIN_ID]: { config: { apiKey: "x", project: "y", debug: true } } },
      },
    }
    setPluginEntry(settings, { apiKey: "x", project: "y", baseUrl: undefined })
    const config = settings.plugins?.entries?.[PLUGIN_ID]?.config as Record<string, unknown>
    expect(config.debug).toBe(true)
  })

  it("preserves existing allowConversationAccess when not overridden — and mirrors into hooks", () => {
    const settings: OpenClawSettings = {
      plugins: {
        entries: {
          [PLUGIN_ID]: { config: { apiKey: "x", project: "y", allowConversationAccess: false } },
        },
      },
    }
    setPluginEntry(settings, { apiKey: "x", project: "y", baseUrl: undefined })
    const entry = settings.plugins?.entries?.[PLUGIN_ID]
    expect(entry?.config?.allowConversationAccess).toBe(false)
    expect(entry?.hooks?.allowConversationAccess).toBe(false)
  })

  it("explicit allowConversationAccess in patch overrides existing — both config and hooks update", () => {
    const settings: OpenClawSettings = {
      plugins: {
        entries: {
          [PLUGIN_ID]: {
            hooks: { allowConversationAccess: false },
            config: { apiKey: "x", project: "y", allowConversationAccess: false },
          },
        },
      },
    }
    setPluginEntry(settings, {
      apiKey: "x",
      project: "y",
      baseUrl: undefined,
      allowConversationAccess: true,
    })
    const entry = settings.plugins?.entries?.[PLUGIN_ID]
    expect(entry?.config?.allowConversationAccess).toBe(true)
    expect(entry?.hooks?.allowConversationAccess).toBe(true)
  })
})

describe("addToPluginsAllow", () => {
  it("adds the plugin id when missing", () => {
    const settings: OpenClawSettings = {}
    expect(addToPluginsAllow(settings)).toBe(true)
    expect(settings.plugins?.allow).toEqual([PLUGIN_ID])
  })

  it("is idempotent when the id is already present", () => {
    const settings: OpenClawSettings = { plugins: { allow: [PLUGIN_ID, "other"] } }
    expect(addToPluginsAllow(settings)).toBe(false)
    expect(settings.plugins?.allow).toEqual([PLUGIN_ID, "other"])
  })

  it("preserves other entries already in the allow list", () => {
    const settings: OpenClawSettings = { plugins: { allow: ["foo", "bar"] } }
    addToPluginsAllow(settings)
    expect(settings.plugins?.allow).toEqual(["foo", "bar", PLUGIN_ID])
  })

  it("treats a hand-edited non-array allow as empty (defensive)", () => {
    // openclaw.json is user-editable; if someone wrote `"allow": "foo"`
    // instead of `"allow": ["foo"]`, we must not spread the string into
    // characters. Replace the bad value with a clean single-element array.
    const settings = { plugins: { allow: "wrong" as unknown as string[] } } as OpenClawSettings
    expect(addToPluginsAllow(settings)).toBe(true)
    expect(settings.plugins?.allow).toEqual([PLUGIN_ID])
  })
})

describe("removeFromPluginsAllow", () => {
  it("removes only our id", () => {
    const settings: OpenClawSettings = { plugins: { allow: ["foo", PLUGIN_ID, "bar"] } }
    expect(removeFromPluginsAllow(settings)).toBe(true)
    expect(settings.plugins?.allow).toEqual(["foo", "bar"])
  })

  it("returns false when nothing changes", () => {
    const settings: OpenClawSettings = { plugins: { allow: ["foo"] } }
    expect(removeFromPluginsAllow(settings)).toBe(false)
    expect(settings.plugins?.allow).toEqual(["foo"])
  })

  it("returns false when allow is missing entirely", () => {
    const settings: OpenClawSettings = {}
    expect(removeFromPluginsAllow(settings)).toBe(false)
  })
})

describe("migrateLegacyEntries", () => {
  it("does NOT strip hooks.allowConversationAccess (it's load-bearing on 2026.4.25+)", () => {
    // Regression guard: 0.0.2 used to strip this key here. On current OpenClaw
    // versions the key is required, so the strip would break dispatch.
    // setPluginEntry overwrites it with the right value anyway; the
    // migration's only job now is the env sweep.
    const settings: OpenClawSettings = {
      plugins: {
        entries: {
          [PLUGIN_ID]: {
            enabled: true,
            hooks: { allowConversationAccess: true },
          },
        },
      },
    }
    migrateLegacyEntries(settings)
    const entry = settings.plugins?.entries?.[PLUGIN_ID]
    expect(entry?.hooks?.allowConversationAccess).toBe(true)
  })

  it("strips top-level env.LATITUDE_* keys our 0.0.1 installer leaked", () => {
    const settings = {
      env: {
        LATITUDE_API_KEY: "old",
        LATITUDE_PROJECT: "old",
        LATITUDE_BASE_URL: "https://staging-ingest.latitude.so",
      },
    }
    const { changed } = migrateLegacyEntries(settings)
    expect(changed).toBe(true)
    expect(settings.env).toBeUndefined()
  })

  it("leaves a real OpenClaw env block alone (shellEnv + vars)", () => {
    const settings = {
      env: {
        shellEnv: { enabled: true },
        vars: { CUSTOM_VAR: "value" },
      },
    }
    migrateLegacyEntries(settings)
    expect(settings.env).toBeDefined()
    expect(settings.env.shellEnv.enabled).toBe(true)
    expect(settings.env.vars.CUSTOM_VAR).toBe("value")
  })
})

describe("removePluginEntry", () => {
  it("removes the plugin entry and reports whether it changed anything", () => {
    const settings: OpenClawSettings = {
      plugins: { entries: { [PLUGIN_ID]: { enabled: true }, "other-plugin": { enabled: true } } },
    }
    expect(removePluginEntry(settings)).toBe(true)
    expect(PLUGIN_ID in (settings.plugins?.entries ?? {})).toBe(false)
    expect("other-plugin" in (settings.plugins?.entries ?? {})).toBe(true)
    expect(removePluginEntry(settings)).toBe(false)
  })
})
