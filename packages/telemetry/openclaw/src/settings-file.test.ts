import { describe, expect, it } from "vitest"
import {
  migrateLegacyEntries,
  type OpenClawSettings,
  PLUGIN_ID,
  removePluginEntry,
  setPluginEntry,
} from "./settings-file.ts"

describe("setPluginEntry", () => {
  it("writes credentials under .config (not .hooks, not top-level env)", () => {
    const settings: OpenClawSettings = {}
    setPluginEntry(settings, {
      apiKey: "k",
      project: "p",
      baseUrl: "https://staging-ingest.latitude.so",
      allowConversationAccess: true,
      debug: false,
    })

    const entry = settings.plugins?.entries?.[PLUGIN_ID] as
      | { enabled?: boolean; config?: Record<string, unknown>; hooks?: unknown }
      | undefined

    // Strict zod compliance: nothing under hooks, nothing at top-level env.
    expect(entry?.hooks).toBeUndefined()
    expect((settings as { env?: unknown }).env).toBeUndefined()

    expect(entry?.enabled).toBe(true)
    expect(entry?.config?.apiKey).toBe("k")
    expect(entry?.config?.project).toBe("p")
    expect(entry?.config?.baseUrl).toBe("https://staging-ingest.latitude.so")
    expect(entry?.config?.allowConversationAccess).toBe(true)
  })

  it("clears baseUrl when undefined (production install after a staging install)", () => {
    const settings = {
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
    const config = settings.plugins.entries[PLUGIN_ID]?.config as Record<string, unknown>
    expect(config.baseUrl).toBeUndefined()
    expect(config.apiKey).toBe("new-k")
  })

  it("preserves unrelated fields on the existing plugin entry", () => {
    const settings = {
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
    const entry = settings.plugins.entries[PLUGIN_ID] as {
      subagent?: { allowModelOverride?: boolean }
      config?: Record<string, unknown>
    }
    expect(entry.subagent?.allowModelOverride).toBe(true)
    expect(entry.config?.customField).toBe("keep me")
    expect(entry.config?.apiKey).toBe("k")
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

  it("preserves existing allowConversationAccess when not overridden", () => {
    const settings: OpenClawSettings = {
      plugins: {
        entries: {
          [PLUGIN_ID]: { config: { apiKey: "x", project: "y", allowConversationAccess: false } },
        },
      },
    }
    setPluginEntry(settings, { apiKey: "x", project: "y", baseUrl: undefined })
    const config = settings.plugins?.entries?.[PLUGIN_ID]?.config as Record<string, unknown>
    expect(config.allowConversationAccess).toBe(false)
  })

  it("explicit allowConversationAccess in patch overrides existing", () => {
    const settings: OpenClawSettings = {
      plugins: {
        entries: {
          [PLUGIN_ID]: { config: { apiKey: "x", project: "y", allowConversationAccess: false } },
        },
      },
    }
    setPluginEntry(settings, {
      apiKey: "x",
      project: "y",
      baseUrl: undefined,
      allowConversationAccess: true,
    })
    const config = settings.plugins?.entries?.[PLUGIN_ID]?.config as Record<string, unknown>
    expect(config.allowConversationAccess).toBe(true)
  })
})

describe("migrateLegacyEntries", () => {
  it("strips hooks.allowConversationAccess written by the 0.0.1 installer", () => {
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
    const { changed } = migrateLegacyEntries(settings)
    expect(changed).toBe(true)
    const entry = settings.plugins?.entries?.[PLUGIN_ID] as { hooks?: unknown }
    expect(entry.hooks).toBeUndefined()
  })

  it("preserves hooks.allowPromptInjection (a real OpenClaw key) when present alongside our legacy key", () => {
    const settings: OpenClawSettings = {
      plugins: {
        entries: {
          [PLUGIN_ID]: {
            hooks: { allowPromptInjection: true, allowConversationAccess: true },
          },
        },
      },
    }
    migrateLegacyEntries(settings)
    const entry = settings.plugins?.entries?.[PLUGIN_ID] as { hooks?: { allowPromptInjection?: boolean } }
    expect(entry.hooks?.allowPromptInjection).toBe(true)
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
    const settings = {
      plugins: { entries: { [PLUGIN_ID]: { enabled: true }, "other-plugin": { enabled: true } } },
    }
    expect(removePluginEntry(settings)).toBe(true)
    expect(PLUGIN_ID in settings.plugins.entries).toBe(false)
    expect("other-plugin" in settings.plugins.entries).toBe(true)
    expect(removePluginEntry(settings)).toBe(false)
  })
})
