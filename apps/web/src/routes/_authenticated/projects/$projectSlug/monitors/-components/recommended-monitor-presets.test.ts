import { createMonitorUseCase, MonitorRepository } from "@domain/monitors"
import { createFakeMonitorRepository } from "@domain/monitors/testing"
import { SavedSearchRepository } from "@domain/saved-searches"
import { createFakeSavedSearchRepository } from "@domain/saved-searches/testing"
import type { MonitorMetric } from "@domain/shared"
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

type MonitorTrigger = "threshold" | "escalating" | "match"

interface PresetExpectation {
  readonly trigger: MonitorTrigger
  readonly metric: MonitorMetric
}

const SPECIFIC_TOOL_PRESET_EXPECTATIONS: Record<string, PresetExpectation> = {
  failing: { trigger: "threshold", metric: { kind: "errorRate" } },
  slow: { trigger: "threshold", metric: { kind: "median", field: "duration" } },
  "usage-spike": { trigger: "escalating", metric: { kind: "count" } },
  "usage-drop": { trigger: "escalating", metric: { kind: "count" } },
  overusing: { trigger: "escalating", metric: { kind: "count" } },
}

const ALL_TOOLS_PRESET_EXPECTATIONS: Record<string, PresetExpectation> = {
  "failures-increased": { trigger: "threshold", metric: { kind: "errorRate" } },
  "latency-increased": { trigger: "threshold", metric: { kind: "median", field: "duration" } },
  "usage-spike": { trigger: "escalating", metric: { kind: "count" } },
  "usage-drop": { trigger: "escalating", metric: { kind: "count" } },
  "cost-spike": { trigger: "threshold", metric: { kind: "sum", field: "cost" } },
}

const USER_PRESET_EXPECTATIONS: Record<string, PresetExpectation> = {
  errors: { trigger: "escalating", metric: { kind: "count" } },
  slow: { trigger: "threshold", metric: { kind: "median", field: "duration" } },
  "activity-spike": { trigger: "escalating", metric: { kind: "count" } },
  "activity-drop": { trigger: "escalating", metric: { kind: "count" } },
  "cost-spike": { trigger: "threshold", metric: { kind: "sum", field: "cost" } },
}

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

const assertPresetsCreate = async (
  presets: ReturnType<typeof toolMonitorPresets>,
  expectations: Record<string, PresetExpectation>,
  nameSuffix: string,
) => {
  expect(presets.map((preset) => preset.id).sort()).toEqual(Object.keys(expectations).sort())

  for (const preset of presets) {
    const expected = expectations[preset.id]
    expect(expected, preset.id).toBeDefined()
    if (!expected) continue

    const rule = draftToAlertDraft(preset.draft)
    const presetTarget = draftToTarget(preset.draft)
    expect(presetTarget, preset.id).toBeDefined()
    if (!presetTarget) continue

    const monitor = await runCreate(
      createFromUiDraft({
        name: `${preset.name} — ${nameSuffix}`,
        description: preset.description,
        rule,
        target: presetTarget,
      }),
    )

    expect(monitor.rule.trigger, preset.id).toBe(expected.trigger)
    expect(monitor.target.metric, preset.id).toEqual(expected.metric)
    expect(rule.kind, preset.id).toBe(`monitor.${expected.trigger}`)
  }
}

describe("recommended monitor presets", () => {
  it("creates every specific-tool recommended preset", async () => {
    await assertPresetsCreate(
      toolMonitorPresets(toolMonitorTarget("searchWeb")),
      SPECIFIC_TOOL_PRESET_EXPECTATIONS,
      "searchWeb",
    )
  })

  it("creates every all-tools recommended preset", async () => {
    await assertPresetsCreate(toolMonitorPresets(allToolsMonitorTarget()), ALL_TOOLS_PRESET_EXPECTATIONS, "all tools")
  })

  it.each([
    ["specific user", userMonitorTarget("user-1")],
    ["all users", allUsersMonitorTarget()],
  ] as const)("creates every user recommended preset for %s", async (_label, target) => {
    await assertPresetsCreate(userMonitorPresets(target), USER_PRESET_EXPECTATIONS, "user")
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
