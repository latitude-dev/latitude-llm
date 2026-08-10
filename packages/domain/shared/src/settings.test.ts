import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { OrganizationId, type ProjectId } from "./id.ts"
import {
  DEFAULT_REDACTION_ENTITIES,
  deserializeRedactionPolicy,
  isRuleEnabled,
  isSameRedactionSetting,
  type OrganizationSettings,
  organizationSettingsSchema,
  type ProjectSettings,
  projectSettingsSchema,
  REDACTION_MAX_RULES,
  REDACTION_RULE_MAX_PATTERN_CHARS,
  RESERVED_REDACTION_LABELS,
  type RedactionRule,
  redactionRuleSchema,
  resolveRedactionPolicy,
  resolveSettings,
  resolveSettingsCascade,
  SettingsReader,
  serializeRedactionPolicy,
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

const termsRule = (overrides: Record<string, unknown> = {}) => ({
  id: "rule-1",
  label: "ACCOUNT_NUMBER",
  kind: "terms",
  terms: ["ACME-1234"],
  ...overrides,
})

describe("redaction rule schema", () => {
  it.each([
    ["attribute_key", { id: "r", label: "TAX_ID", kind: "attribute_key", keys: ["myco.customer.tax_id"] }],
    ["terms", termsRule()],
    ["pattern", { id: "r", label: "ACCOUNT_NUMBER", kind: "pattern", pattern: "ACCT-\\d{9}" }],
  ])("accepts a %s rule", (_kind, rule) => {
    expect(() => redactionRuleSchema.parse(rule)).not.toThrow()
  })

  it.each([
    "email",
    "Account_Number",
    "AN",
    "ACCOUNT NUMBER",
    "1ACCOUNT",
    "ACCOUNT-NUMBER",
  ])("rejects the label %s, which the chip grammar could not render", (label) => {
    expect(() => redactionRuleSchema.parse(termsRule({ label }))).toThrow()
  })

  // A custom rule wearing a built-in label would merge into its count and make the chip
  // tooltip assert something about the value that may be false.
  it.each([...RESERVED_REDACTION_LABELS])("rejects the reserved label %s", (label) => {
    expect(() => redactionRuleSchema.parse(termsRule({ label }))).toThrow()
  })

  it("rejects a term below the minimum length, which would shred ordinary prose", () => {
    expect(() => redactionRuleSchema.parse(termsRule({ terms: ["ab"] }))).toThrow()
  })

  it("rejects a terms list over the total character budget", () => {
    const terms = Array.from({ length: 40 }, (_, index) => `${index}`.padStart(200, "x"))

    expect(() => redactionRuleSchema.parse(termsRule({ terms }))).toThrow()
  })

  it("rejects a pattern longer than the cap", () => {
    const rule = { id: "r", label: "LONG", kind: "pattern", pattern: "a".repeat(REDACTION_RULE_MAX_PATTERN_CHARS + 1) }

    expect(() => redactionRuleSchema.parse(rule)).toThrow()
  })

  it("rejects more rules than the cap allows, which bounds the queue payload", () => {
    const rules = Array.from({ length: REDACTION_MAX_RULES + 1 }, (_, index) =>
      termsRule({ id: `rule-${index}`, label: `RULE_${index}` }),
    )

    expect(() => projectSettingsSchema.parse({ redaction: { rules } })).toThrow()
  })

  it("treats a rule as enabled unless it says otherwise", () => {
    expect(isRuleEnabled(redactionRuleSchema.parse(termsRule()))).toBe(true)
    expect(isRuleEnabled(redactionRuleSchema.parse(termsRule({ enabled: false })))).toBe(false)
  })
})

describe("resolveRedactionPolicy rules", () => {
  const rule = (label: string) => redactionRuleSchema.parse(termsRule({ id: label, label }))

  it("defaults to no rules", () => {
    expect(resolveRedactionPolicy({ organization: null, project: null }).rules).toEqual([])
  })

  // Replace rather than union, matching `entities`: an unlocked organization policy is a
  // default a project may weaken, and `locked` is what turns it into a floor.
  it("lets a project override the organization rule list entirely", () => {
    const policy = resolveRedactionPolicy({
      organization: { redaction: { rules: [rule("ORG_RULE")] } },
      project: { redaction: { rules: [rule("PROJECT_RULE")] } },
    })

    expect(policy.rules.map((entry) => entry.label)).toEqual(["PROJECT_RULE"])
  })

  it("inherits the organization rules when the project sets none", () => {
    const policy = resolveRedactionPolicy({
      organization: { redaction: { rules: [rule("ORG_RULE")] } },
      project: { redaction: { mode: "enforce" } },
    })

    expect(policy.rules.map((entry) => entry.label)).toEqual(["ORG_RULE"])
  })

  it("ignores project rules under a locked organization policy", () => {
    const policy = resolveRedactionPolicy({
      organization: { redaction: { locked: true, rules: [rule("ORG_RULE")] } },
      project: { redaction: { rules: [rule("PROJECT_RULE")] } },
    })

    expect(policy.rules.map((entry) => entry.label)).toEqual(["ORG_RULE"])
    expect(policy.source).toBe("organization")
  })

  // `source` drives the "following the organization policy" copy, so a layer that set only
  // rules has to register as having set something.
  it("reports a rules-only project override as coming from the project", () => {
    const policy = resolveRedactionPolicy({
      organization: { redaction: { mode: "enforce" } },
      project: { redaction: { rules: [rule("PROJECT_RULE")] } },
    })

    expect(policy.source).toBe("project")
  })

  it("does not treat an unlocked organization lock flag alone as a policy", () => {
    const policy = resolveRedactionPolicy({ organization: { redaction: { locked: false } }, project: null })

    expect(policy.source).toBe("default")
  })
})

describe("serializeRedactionPolicy rules", () => {
  const enforced = (rules: RedactionRule[]) =>
    resolveRedactionPolicy({ organization: null, project: { redaction: { mode: "enforce", rules } } })

  it("omits rules entirely when there are none, keeping the payload as it was before rules existed", () => {
    expect(serializeRedactionPolicy(enforced([]))).not.toHaveProperty("rules")
  })

  it("round-trips rules through the wire form", () => {
    const rules = [redactionRuleSchema.parse(termsRule())]
    const wire = serializeRedactionPolicy(enforced(rules))

    expect(deserializeRedactionPolicy(wire)?.rules).toEqual(rules)
  })

  it("deserializes a payload with no rules field as no rules", () => {
    const wire = { entities: ["email"], redactMetadata: false, identities: "keep" }

    expect(deserializeRedactionPolicy(wire)?.rules).toEqual([])
  })

  it("rejects a payload whose rules are malformed rather than dropping them", () => {
    const wire = { entities: ["email"], redactMetadata: false, identities: "keep", rules: [{ kind: "terms" }] }

    expect(deserializeRedactionPolicy(wire)).toBeNull()
  })
})

describe("isSameRedactionSetting", () => {
  const rule = (label: string) => redactionRuleSchema.parse(termsRule({ id: label, label }))

  it("treats null and undefined as the same absence", () => {
    expect(isSameRedactionSetting(null, undefined)).toBe(true)
  })

  it("ignores entity order, which is a UI artifact", () => {
    expect(isSameRedactionSetting({ entities: ["email", "secret"] }, { entities: ["secret", "email"] })).toBe(true)
  })

  /**
   * The regression this function was rewritten for: comparing a hand-listed set of fields made
   * every later field invisible, so a rules-only edit compared equal and the write returned
   * early — nothing saved, no audit event, and the caller still reported success.
   */
  it("sees a change that touches only the rules", () => {
    expect(isSameRedactionSetting({ mode: "enforce" }, { mode: "enforce", rules: [rule("NEW_RULE")] })).toBe(false)
  })

  it("sees a rule edited in place", () => {
    const before = { rules: [rule("SAME_LABEL")] }
    const after = {
      rules: [redactionRuleSchema.parse(termsRule({ id: "SAME_LABEL", label: "SAME_LABEL", terms: ["OTHER-9999"] }))],
    }

    expect(isSameRedactionSetting(before, after)).toBe(false)
  })

  it("sees a rule disabled", () => {
    const before = { rules: [rule("A_RULE")] }
    const after = { rules: [redactionRuleSchema.parse(termsRule({ id: "A_RULE", label: "A_RULE", enabled: false }))] }

    expect(isSameRedactionSetting(before, after)).toBe(false)
  })

  // Rule order decides which label wins an exact overlap tie, so it is not a UI artifact.
  it("sees a reordered rule list", () => {
    const before = { rules: [rule("FIRST"), rule("SECOND")] }
    const after = { rules: [rule("SECOND"), rule("FIRST")] }

    expect(isSameRedactionSetting(before, after)).toBe(false)
  })

  it("still sees the fields it always compared", () => {
    expect(isSameRedactionSetting({ mode: "off" }, { mode: "enforce" })).toBe(false)
    expect(isSameRedactionSetting({ identities: "keep" }, { identities: "pseudonymize" })).toBe(false)
    expect(isSameRedactionSetting({ scopes: { metadata: true } }, { scopes: { metadata: false } })).toBe(false)
    expect(isSameRedactionSetting({ locked: true }, { locked: false })).toBe(false)
  })

  it("treats an absent field and an explicitly undefined field as the same", () => {
    expect(isSameRedactionSetting({ mode: "enforce" }, { mode: "enforce", identities: undefined })).toBe(true)
  })
})
