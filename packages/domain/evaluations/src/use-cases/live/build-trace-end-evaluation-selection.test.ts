import { EvaluationId, type FilterSet } from "@domain/shared"
import { describe, expect, it } from "vitest"
import { defaultEvaluationTrigger, type Evaluation, evaluationSchema } from "../../entities/evaluation.ts"
import {
  buildLiveTraceEndEvaluationSelectionKey,
  buildTraceEndEvaluationSelectionInputs,
} from "./build-trace-end-evaluation-selection.ts"

const ORG_ID = "o".repeat(24)
const PROJECT_ID = "p".repeat(24)

const makeEvaluation = (input: {
  readonly id: string
  readonly signalId: string
  readonly sampling?: number
  readonly archivedAt?: Date | null
}): Evaluation =>
  evaluationSchema.parse({
    id: EvaluationId(input.id),
    organizationId: ORG_ID,
    projectId: PROJECT_ID,
    signalId: input.signalId,
    name: `eval-${input.id}`,
    description: "",
    script: "true",
    trigger: { ...defaultEvaluationTrigger(), sampling: input.sampling ?? 100 },
    alignment: null,
    alignedAt: null,
    archivedAt: input.archivedAt ?? null,
    deletedAt: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  })

const SIGNAL_WITH_FILTER = "a".repeat(24)
const SIGNAL_WITHOUT_FILTER = "b".repeat(24)
const filter: FilterSet = { status: [{ op: "in", value: ["error"] }] }

describe("buildTraceEndEvaluationSelectionInputs", () => {
  it("gates on the owning signal's filters from the map", () => {
    const evaluation = makeEvaluation({ id: "e".repeat(24), signalId: SIGNAL_WITH_FILTER })
    const { items } = buildTraceEndEvaluationSelectionInputs([evaluation], new Map([[SIGNAL_WITH_FILTER, filter]]))

    const spec = items[buildLiveTraceEndEvaluationSelectionKey(evaluation.id)]
    expect(spec?.filter).toEqual(filter)
    expect(spec?.sampling).toBe(100)
    expect(spec?.sampleKey).toBe(evaluation.id)
  })

  it("omits the filter (match all) when the signal has no filters or is absent from the map", () => {
    const nullFilter = makeEvaluation({ id: "f".repeat(24), signalId: SIGNAL_WITHOUT_FILTER, sampling: 50 })
    const missing = makeEvaluation({ id: "g".repeat(24), signalId: "c".repeat(24) })
    const { items } = buildTraceEndEvaluationSelectionInputs(
      [nullFilter, missing],
      new Map([[SIGNAL_WITHOUT_FILTER, null]]),
    )

    const nullSpec = items[buildLiveTraceEndEvaluationSelectionKey(nullFilter.id)]
    expect(nullSpec?.filter).toBeUndefined()
    expect(nullSpec?.sampling).toBe(50)

    const missingSpec = items[buildLiveTraceEndEvaluationSelectionKey(missing.id)]
    expect(missingSpec?.filter).toBeUndefined()
  })

  it("skips and counts ineligible (archived/paused) evaluations", () => {
    const archived = makeEvaluation({
      id: "h".repeat(24),
      signalId: SIGNAL_WITH_FILTER,
      archivedAt: new Date("2026-01-02T00:00:00.000Z"),
    })
    const paused = makeEvaluation({ id: "i".repeat(24), signalId: SIGNAL_WITH_FILTER, sampling: 0 })
    const active = makeEvaluation({ id: "j".repeat(24), signalId: SIGNAL_WITH_FILTER })

    const { items, skippedIneligibleCount, evaluationByKey } = buildTraceEndEvaluationSelectionInputs(
      [archived, paused, active],
      new Map([[SIGNAL_WITH_FILTER, filter]]),
    )

    expect(skippedIneligibleCount).toBe(2)
    expect(evaluationByKey.size).toBe(1)
    expect(items[buildLiveTraceEndEvaluationSelectionKey(active.id)]?.filter).toEqual(filter)
    expect(items[buildLiveTraceEndEvaluationSelectionKey(archived.id)]).toBeUndefined()
  })
})
