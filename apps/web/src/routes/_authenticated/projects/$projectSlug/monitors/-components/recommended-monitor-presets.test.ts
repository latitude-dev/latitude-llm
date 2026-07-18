import { createMonitorUseCase, MonitorRepository } from "@domain/monitors"
import { createFakeMonitorRepository } from "@domain/monitors/testing"
import { SavedSearchRepository } from "@domain/saved-searches"
import { createFakeSavedSearchRepository } from "@domain/saved-searches/testing"
import { OrganizationId, ProjectId, SqlClient, ValidationError } from "@domain/shared"
import { createFakeSqlClient } from "@domain/shared/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import {
  allToolsMonitorTarget,
  allUsersMonitorTarget,
  toolMonitorTarget,
  userMonitorTarget,
} from "../../../../../../domains/monitors/monitor-target.ts"
import type { MonitorRuleDraft } from "../../../../../../domains/monitors/monitors.collection.ts"
import { draftToAlertDraft, draftToTarget, targetAlertDraft } from "./alert-form-helpers.ts"
import { toolMonitorPresets, userMonitorPresets } from "./recommended-monitor-presets.ts"

const organizationId = OrganizationId("o".repeat(24))
const projectId = ProjectId("p".repeat(24))

const triggerForAlertKind = (kind: MonitorRuleDraft["kind"]) =>
  kind.includes("threshold")
    ? ("threshold" as const)
    : kind.includes("escalating")
      ? ("escalating" as const)
      : ("match" as const)

/** Mirrors apps/web createMonitor server-fn mapping of UI draft → domain create input. */
const createFromUiDraft = (input: {
  readonly name: string
  readonly description: string
  readonly rule: MonitorRuleDraft
  readonly target: NonNullable<ReturnType<typeof draftToTarget>>
}) => {
  const trigger = triggerForAlertKind(input.rule.kind)
  const metric = input.target.metric ?? { kind: "count" as const }
  return createMonitorUseCase({
    organizationId,
    projectId,
    name: input.name,
    description: input.description,
    target: input.target,
    rule: {
      trigger,
      config: {
        ...(input.target.filterSet ? { filterSet: input.target.filterSet } : {}),
        metric,
        ...(input.rule.condition ? { condition: input.rule.condition } : {}),
      },
      severity: input.rule.severity ?? "medium",
    },
  })
}

const runCreate = (effect: ReturnType<typeof createFromUiDraft>) => {
  const { repo } = createFakeMonitorRepository()
  return Effect.runPromise(
    effect.pipe(
      Effect.provide(
        Layer.mergeAll(
          Layer.succeed(MonitorRepository, MonitorRepository.of(repo)),
          Layer.succeed(SavedSearchRepository, SavedSearchRepository.of(createFakeSavedSearchRepository().repository)),
          Layer.succeed(SqlClient, createFakeSqlClient({ organizationId })),
        ),
      ),
    ),
  )
}

const runCreateError = (effect: ReturnType<typeof createFromUiDraft>) => {
  const { repo } = createFakeMonitorRepository()
  return Effect.runPromise(
    effect.pipe(
      Effect.flip,
      Effect.provide(
        Layer.mergeAll(
          Layer.succeed(MonitorRepository, MonitorRepository.of(repo)),
          Layer.succeed(SavedSearchRepository, SavedSearchRepository.of(createFakeSavedSearchRepository().repository)),
          Layer.succeed(SqlClient, createFakeSqlClient({ organizationId })),
        ),
      ),
    ),
  )
}

describe("recommended monitor presets", () => {
  it.each([
    ["specific tool", toolMonitorTarget("searchWeb")],
    ["all tools", allToolsMonitorTarget()],
  ] as const)("creates every tool recommended preset for %s", async (_label, target) => {
    const presets = toolMonitorPresets(target)
    expect(presets.length).toBeGreaterThan(0)

    for (const preset of presets) {
      const rule = draftToAlertDraft(preset.draft)
      const presetTarget = draftToTarget(preset.draft)
      expect(presetTarget, preset.id).toBeDefined()
      if (!presetTarget) continue

      const monitor = await runCreate(
        createFromUiDraft({
          name: `${preset.name} — searchWeb`,
          description: preset.description,
          rule,
          target: presetTarget,
        }),
      )

      const expectedTrigger = preset.draft.metric.kind === "count" ? "escalating" : "threshold"
      expect(monitor.rule.trigger, preset.id).toBe(expectedTrigger)
      expect(monitor.target.metric, preset.id).toEqual(preset.draft.metric)
      expect(rule.kind, preset.id).toBe(`monitor.${expectedTrigger}`)
    }
  })

  it.each([
    ["specific user", userMonitorTarget("user-1")],
    ["all users", allUsersMonitorTarget()],
  ] as const)("creates every user recommended preset for %s", async (_label, target) => {
    const presets = userMonitorPresets(target)
    expect(presets.length).toBeGreaterThan(0)

    for (const preset of presets) {
      const rule = draftToAlertDraft(preset.draft)
      const presetTarget = draftToTarget(preset.draft)
      expect(presetTarget, preset.id).toBeDefined()
      if (!presetTarget) continue

      const monitor = await runCreate(
        createFromUiDraft({
          name: `${preset.name} — user`,
          description: preset.description,
          rule,
          target: presetTarget,
        }),
      )

      const expectedTrigger = preset.draft.metric.kind === "count" ? "escalating" : "threshold"
      expect(monitor.rule.trigger, preset.id).toBe(expectedTrigger)
      expect(monitor.target.metric, preset.id).toEqual(preset.draft.metric)
    }
  })

  it("still rejects the pre-fix escalating + errorRate shape", async () => {
    const draft = targetAlertDraft(toolMonitorTarget("searchWeb"), {
      kind: "monitor.escalating",
      metric: { kind: "errorRate" },
      comparison: "timesMoreThan",
      baselineKind: "expected",
      amount: 3,
      windowAmount: 15,
      windowUnit: "minutes",
      severity: "high",
    })
    const rule = draftToAlertDraft(draft)
    const target = draftToTarget(draft)
    expect(target).toBeDefined()
    if (!target) return

    const error = await runCreateError(
      createFromUiDraft({
        name: "Tool is failing — searchWeb",
        description: "regression",
        rule,
        target,
      }),
    )

    expect(error).toBeInstanceOf(ValidationError)
    expect(error.message).toBe("Escalating monitors only support count metrics")
  })

  it("maps Tool is failing to threshold + errorRate", () => {
    const failing = toolMonitorPresets(toolMonitorTarget("searchWeb")).find((preset) => preset.id === "failing")
    expect(failing).toBeDefined()
    if (!failing) return
    expect(failing.draft.kind).toBe("monitor.threshold")
    expect(failing.draft.metric).toEqual({ kind: "errorRate" })
    expect(draftToAlertDraft(failing.draft).condition).toMatchObject({
      trigger: "threshold",
      metric: { kind: "errorRate" },
      threshold: { mode: "expected", sensitivity: 3 },
    })
  })
})
