import { OrganizationId, ProjectId } from "@domain/shared"
import { describe, expect, it } from "vitest"
import type { AgentDispatchConfigRow } from "../entities/agent-dispatch-config.ts"
import {
  checkTargetReadiness,
  resolveEffectiveConfig,
  resolveEffectiveConfigsForProject,
} from "./resolve-effective-config.ts"

const ORG = OrganizationId("o".padEnd(24, "0"))
const PROJECT = ProjectId("p".padEnd(24, "0"))
const now = new Date("2026-07-09T00:00:00.000Z")

const row = (overrides: Partial<AgentDispatchConfigRow>): AgentDispatchConfigRow => ({
  id: "id".padEnd(24, "0"),
  organizationId: ORG,
  projectId: null,
  integrationId: "int".padEnd(24, "0"),
  kind: "webhook",
  enabled: true,
  triggers: ["signal.discovered"],
  target: { webhookUrl: "https://example.com/hook" },
  promptTemplate: null,
  guardrails: { maxDispatchesPerDay: 5, cooldownMinutes: 30 },
  createdAt: now,
  updatedAt: now,
  ...overrides,
})

describe("resolveEffectiveConfig", () => {
  it("returns null when both default and override are null", () => {
    expect(resolveEffectiveConfig({ projectId: PROJECT, defaultConfig: null, override: null })).toBeNull()
  })

  it("uses the default when there is no override, resolving projectId to the caller", () => {
    const effective = resolveEffectiveConfig({
      projectId: PROJECT,
      defaultConfig: row({ projectId: null }),
      override: null,
    })
    expect(effective?.projectId).toBe(PROJECT)
    expect(effective?.enabled).toBe(true)
    expect(effective?.target).toEqual({ webhookUrl: "https://example.com/hook" })
  })

  it("lets a non-null override field win wholly", () => {
    const effective = resolveEffectiveConfig({
      projectId: PROJECT,
      defaultConfig: row({ projectId: null }),
      override: row({
        id: "ovr".padEnd(24, "0"),
        projectId: PROJECT,
        enabled: false,
        triggers: null,
        target: { webhookUrl: "https://project.example.com/hook" },
        guardrails: null,
      }),
    })
    expect(effective?.id).toBe("ovr".padEnd(24, "0"))
    expect(effective?.enabled).toBe(false)
    expect(effective?.triggers).toEqual(["signal.discovered"])
    expect(effective?.target).toEqual({ webhookUrl: "https://project.example.com/hook" })
    expect(effective?.guardrails).toEqual({ maxDispatchesPerDay: 5, cooldownMinutes: 30 })
  })

  it("resolves an override-only row (legacy full row with no default)", () => {
    const effective = resolveEffectiveConfig({
      projectId: PROJECT,
      defaultConfig: null,
      override: row({ id: "ovr".padEnd(24, "0"), projectId: PROJECT }),
    })
    expect(effective?.id).toBe("ovr".padEnd(24, "0"))
    expect(effective?.enabled).toBe(true)
  })

  it("falls back to defaults for a row with all-null overridable fields", () => {
    const effective = resolveEffectiveConfig({
      projectId: PROJECT,
      defaultConfig: null,
      override: row({
        id: "ovr".padEnd(24, "0"),
        projectId: PROJECT,
        enabled: null,
        triggers: null,
        target: null,
        guardrails: null,
      }),
    })
    expect(effective?.enabled).toBe(false)
    expect(effective?.triggers).toEqual([])
    expect(effective?.target).toBeNull()
    expect(effective?.guardrails).toEqual({ maxDispatchesPerDay: 10, cooldownMinutes: 60 })
  })
})

describe("resolveEffectiveConfigsForProject", () => {
  it("groups by integration and ignores other projects' overrides", () => {
    const other = ProjectId("x".padEnd(24, "0"))
    const configs = resolveEffectiveConfigsForProject(PROJECT, [
      row({ id: "d".padEnd(24, "0"), projectId: null }),
      row({ id: "mine".padEnd(24, "0"), projectId: PROJECT, target: { webhookUrl: "https://mine.example.com/hook" } }),
      row({
        id: "theirs".padEnd(24, "0"),
        projectId: other,
        target: { webhookUrl: "https://theirs.example.com/hook" },
      }),
    ])
    expect(configs).toHaveLength(1)
    expect(configs[0]?.id).toBe("mine".padEnd(24, "0"))
    expect(configs[0]?.target).toEqual({ webhookUrl: "https://mine.example.com/hook" })
  })
})

describe("checkTargetReadiness", () => {
  it("reports the missing repo for a cursor target without a repoUrl", () => {
    const result = checkTargetReadiness("cursor", { startingRef: "main" })
    expect(result.ready).toBe(false)
    if (result.ready) return
    expect(result.missing).toEqual(["repoUrl"])
  })

  it("reports missing fields for a null target", () => {
    const result = checkTargetReadiness("cursor", null)
    expect(result.ready).toBe(false)
    if (result.ready) return
    expect(result.missing).toContain("repoUrl")
  })

  it("passes a complete cursor target and stamps the kind", () => {
    const result = checkTargetReadiness("cursor", { repoUrl: "https://github.com/acme/app" })
    expect(result.ready).toBe(true)
    if (!result.ready) return
    expect(result.target).toEqual({ repoUrl: "https://github.com/acme/app", kind: "cursor" })
  })

  it("passes complete targets for the other kinds", () => {
    expect(checkTargetReadiness("claude_code", { routineTriggerId: "trig_1" }).ready).toBe(true)
    expect(checkTargetReadiness("linear", { teamId: "team-1" }).ready).toBe(true)
    expect(checkTargetReadiness("webhook", { webhookUrl: "https://example.com/hook" }).ready).toBe(true)
  })
})
