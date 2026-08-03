import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { OrganizationId, type ProjectId } from "./id.ts"
import {
  DEFAULT_REDACTION_ENTITIES,
  deserializeRedactionPolicy,
  type OrganizationSettings,
  organizationSettingsSchema,
  type ProjectSettings,
  projectSettingsSchema,
  resolveRedactionPolicy,
  resolveSettings,
  resolveSettingsCascade,
  SettingsReader,
} from "./settings.ts"
import { SqlClient } from "./sql-client.ts"

const fakeSqlClient = Layer.succeed(SqlClient, {
  organizationId: OrganizationId("system"),
  transaction: ((eff: never) => eff) as never,
  query: (() => Effect.die("SqlClient.query not implemented in settings.test.ts")) as never,
})

function fakeSettingsReader(input: {
  organization: OrganizationSettings | null
  projects?: Record<string, ProjectSettings | null>
}) {
  return Layer.succeed(SettingsReader, {
    getOrganizationSettings: () => Effect.succeed(input.organization),
    getProjectSettings: (projectId: ProjectId) => Effect.succeed(input.projects?.[projectId] ?? null),
  })
}

describe("resolveSettingsCascade", () => {
  it("returns system defaults when both layers are null", () => {
    const result = resolveSettingsCascade({ organization: null, project: null })
    expect(result).toEqual({ keepMonitoring: true })
  })

  it("returns system defaults when both layers are empty objects", () => {
    const result = resolveSettingsCascade({ organization: {}, project: {} })
    expect(result).toEqual({ keepMonitoring: true })
  })

  it("uses organization value when project is null", () => {
    const result = resolveSettingsCascade({ organization: { keepMonitoring: false }, project: null })
    expect(result).toEqual({ keepMonitoring: false })
  })

  it("uses organization value when project field is undefined", () => {
    const result = resolveSettingsCascade({ organization: { keepMonitoring: false }, project: {} })
    expect(result).toEqual({ keepMonitoring: false })
  })

  it("project overrides organization", () => {
    const result = resolveSettingsCascade({
      organization: { keepMonitoring: true },
      project: { keepMonitoring: false },
    })
    expect(result).toEqual({ keepMonitoring: false })
  })

  it("project value wins even when organization is null", () => {
    const result = resolveSettingsCascade({ organization: null, project: { keepMonitoring: false } })
    expect(result).toEqual({ keepMonitoring: false })
  })
})

describe("resolveSettings", () => {
  it("returns system defaults when org has no settings", async () => {
    const layer = fakeSettingsReader({ organization: null })
    const result = await Effect.runPromise(resolveSettings().pipe(Effect.provide(Layer.mergeAll(layer, fakeSqlClient))))
    expect(result).toEqual({ keepMonitoring: true })
  })

  it("returns org-level value when no project is provided", async () => {
    const layer = fakeSettingsReader({ organization: { keepMonitoring: false } })
    const result = await Effect.runPromise(resolveSettings().pipe(Effect.provide(Layer.mergeAll(layer, fakeSqlClient))))
    expect(result).toEqual({ keepMonitoring: false })
  })

  it("does not fetch project settings when projectId is omitted", async () => {
    let projectFetched = false
    const layer = Layer.succeed(SettingsReader, {
      getOrganizationSettings: () => Effect.succeed(null),
      getProjectSettings: () => {
        projectFetched = true
        return Effect.succeed(null)
      },
    })

    await Effect.runPromise(resolveSettings().pipe(Effect.provide(Layer.mergeAll(layer, fakeSqlClient))))
    expect(projectFetched).toBe(false)
  })

  it("merges project override over org settings", async () => {
    const layer = fakeSettingsReader({
      organization: { keepMonitoring: true },
      projects: { proj1: { keepMonitoring: false } },
    })

    const result = await Effect.runPromise(
      resolveSettings({ projectId: "proj1" as ProjectId }).pipe(Effect.provide(Layer.mergeAll(layer, fakeSqlClient))),
    )
    expect(result).toEqual({ keepMonitoring: false })
  })

  it("falls through to org when project has no settings", async () => {
    const layer = fakeSettingsReader({
      organization: { keepMonitoring: false },
      projects: { proj1: null },
    })

    const result = await Effect.runPromise(
      resolveSettings({ projectId: "proj1" as ProjectId }).pipe(Effect.provide(Layer.mergeAll(layer, fakeSqlClient))),
    )
    expect(result).toEqual({ keepMonitoring: false })
  })

  it("falls through to system default when both are empty", async () => {
    const layer = fakeSettingsReader({
      organization: {},
      projects: { proj1: {} },
    })

    const result = await Effect.runPromise(
      resolveSettings({ projectId: "proj1" as ProjectId }).pipe(Effect.provide(Layer.mergeAll(layer, fakeSqlClient))),
    )
    expect(result).toEqual({ keepMonitoring: true })
  })
})

describe("resolveRedactionPolicy", () => {
  it("defaults to off with the default entity set when nothing is configured", () => {
    const policy = resolveRedactionPolicy({ organization: null, project: null })

    expect(policy.mode).toBe("off")
    expect([...policy.entities].sort()).toEqual([...DEFAULT_REDACTION_ENTITIES].sort())
    expect(policy.redactMetadata).toBe(false)
    expect(policy.identities).toBe("keep")
    expect(policy.source).toBe("default")
  })

  it("excludes ip_address from the defaults", () => {
    const policy = resolveRedactionPolicy({ organization: null, project: null })

    expect(policy.entities.has("ip_address")).toBe(false)
  })

  it("uses the project policy when only the project configures redaction", () => {
    const policy = resolveRedactionPolicy({
      organization: null,
      project: { redaction: { mode: "enforce", entities: ["email"], identities: "pseudonymize" } },
    })

    expect(policy.mode).toBe("enforce")
    expect([...policy.entities]).toEqual(["email"])
    expect(policy.identities).toBe("pseudonymize")
    expect(policy.source).toBe("project")
  })

  it("inherits the org policy when the project configures nothing", () => {
    const policy = resolveRedactionPolicy({
      organization: { redaction: { mode: "enforce", entities: ["secret"] } },
      project: {},
    })

    expect(policy.mode).toBe("enforce")
    expect([...policy.entities]).toEqual(["secret"])
    expect(policy.source).toBe("organization")
  })

  it("resolves field by field so a project can override one field and inherit the rest", () => {
    const policy = resolveRedactionPolicy({
      organization: {
        redaction: { mode: "enforce", entities: ["secret"], identities: "pseudonymize", scopes: { metadata: true } },
      },
      project: { redaction: { entities: ["email"] } },
    })

    expect([...policy.entities]).toEqual(["email"])
    expect(policy.mode).toBe("enforce")
    expect(policy.identities).toBe("pseudonymize")
    expect(policy.redactMetadata).toBe(true)
    expect(policy.source).toBe("project")
  })

  it("lets a project turn redaction off when the org policy is not locked", () => {
    const policy = resolveRedactionPolicy({
      organization: { redaction: { mode: "enforce" } },
      project: { redaction: { mode: "off" } },
    })

    expect(policy.mode).toBe("off")
  })

  it("ignores the project policy entirely when the org policy is locked", () => {
    const policy = resolveRedactionPolicy({
      organization: { redaction: { mode: "enforce", entities: ["email"], locked: true } },
      project: { redaction: { mode: "off", entities: ["secret"], identities: "pseudonymize" } },
    })

    expect(policy.mode).toBe("enforce")
    expect([...policy.entities]).toEqual(["email"])
    expect(policy.identities).toBe("keep")
    expect(policy.source).toBe("organization")
  })

  it("falls back to system defaults for fields the locked org policy omits", () => {
    const policy = resolveRedactionPolicy({
      organization: { redaction: { locked: true } },
      project: { redaction: { mode: "enforce" } },
    })

    expect(policy.mode).toBe("off")
    expect([...policy.entities].sort()).toEqual([...DEFAULT_REDACTION_ENTITIES].sort())
    expect(policy.source).toBe("organization")
  })

  it("reports the default source when both sides carry an empty redaction object", () => {
    const policy = resolveRedactionPolicy({ organization: { redaction: {} }, project: { redaction: {} } })

    expect(policy.source).toBe("default")
  })

  it("treats an explicitly false metadata scope as configured", () => {
    const policy = resolveRedactionPolicy({
      organization: { redaction: { scopes: { metadata: true } } },
      project: { redaction: { scopes: { metadata: false } } },
    })

    expect(policy.redactMetadata).toBe(false)
    expect(policy.source).toBe("project")
  })

  it("returns an independent entity set per call so callers cannot mutate shared state", () => {
    const first = resolveRedactionPolicy({ organization: null, project: null })
    const second = resolveRedactionPolicy({ organization: null, project: null })

    expect(first.entities).not.toBe(second.entities)
  })
})

describe("redaction settings schemas", () => {
  it("accepts a full project redaction setting", () => {
    const parsed = projectSettingsSchema.parse({
      redaction: {
        mode: "enforce",
        entities: ["email", "secret"],
        scopes: { metadata: true },
        identities: "pseudonymize",
      },
    })

    expect(parsed.redaction?.mode).toBe("enforce")
  })

  it("rejects an unknown entity", () => {
    expect(() => projectSettingsSchema.parse({ redaction: { entities: ["passport"] } })).toThrow()
  })

  it("rejects an unknown mode", () => {
    expect(() => projectSettingsSchema.parse({ redaction: { mode: "on" } })).toThrow()
  })

  it("drops locked from a project redaction setting", () => {
    const parsed = projectSettingsSchema.parse({ redaction: { locked: true } })

    expect(parsed.redaction).not.toHaveProperty("locked")
  })

  it("accepts locked on an organization redaction setting", () => {
    const parsed = organizationSettingsSchema.parse({ redaction: { mode: "enforce", locked: true } })

    expect(parsed.redaction?.locked).toBe(true)
  })

  it("preserves the sibling organization settings it must not clobber", () => {
    const parsed = organizationSettingsSchema.parse({
      billing: { spendingLimitCents: 5000 },
      wantsShowcase: true,
      redaction: { mode: "enforce" },
    })

    expect(parsed.billing?.spendingLimitCents).toBe(5000)
    expect(parsed.wantsShowcase).toBe(true)
    expect(parsed.redaction?.mode).toBe("enforce")
  })
})

describe("deserializeRedactionPolicy", () => {
  const wire = { entities: ["email"], redactMetadata: false, identities: "keep" as const }

  it("reads a well-formed policy", () => {
    expect(deserializeRedactionPolicy(wire)?.entities.has("email")).toBe(true)
  })

  /**
   * A retired entity and one that never existed look the same on the wire and must not be treated alike.
   * `crypto_wallet` was removed, so a policy naming it was written before the removal and dropping it is the
   * whole of the correct behaviour — failing would make the worker fail closed and drop the batch.
   */
  it("drops a retired entity and keeps the rest of the policy", () => {
    const policy = deserializeRedactionPolicy({ ...wire, entities: ["email", "crypto_wallet"] })

    expect(policy?.entities.has("email")).toBe(true)
    expect(policy?.entities.size).toBe(1)
  })

  it("still returns a policy when every entity it names is retired", () => {
    const policy = deserializeRedactionPolicy({ ...wire, entities: ["crypto_wallet"] })

    expect(policy).not.toBeNull()
    expect(policy?.entities.size).toBe(0)
  })

  /**
   * An entity that is neither current nor retired means the policy came from a newer deploy than this code,
   * where it may name a detector we do not have. Ignoring it would under-redact, so this stays fail-closed.
   */
  it("rejects an entity that was never in the enum", () => {
    expect(deserializeRedactionPolicy({ ...wire, entities: ["passport"] })).toBeNull()
  })

  it("rejects a malformed policy", () => {
    expect(deserializeRedactionPolicy({ ...wire, entities: "not-an-array" })).toBeNull()
  })
})
