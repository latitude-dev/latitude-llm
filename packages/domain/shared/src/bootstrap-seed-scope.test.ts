import { describe, expect, it } from "vitest"
import { bootstrapSeedScope } from "./bootstrap-seed-scope.ts"
import {
  SEED_ANNOTATION_DEMO_TRACE_ID,
  SEED_ANNOTATION_QUEUE_WARRANTY_ID,
  SEED_DATASET_ID,
  SEED_EVALUATION_ID,
  SEED_EXTRA_ISSUE_IDS,
  SEED_EXTRA_ISSUE_UUIDS,
  SEED_ISSUE_ID,
  SEED_ISSUE_UUID,
  SEED_LIFECYCLE_TRACE_IDS,
  SEED_MANUAL_QUEUE_ASSIGNEES,
  SEED_ORG_ID,
  SEED_PROJECT_ID,
  SEED_SCORE_PASSED_ID,
  SEED_TIMELINE_ANCHOR,
  SEED_UI_POLISH_SCORE_IDS,
  SEED_WARRANTY_DATASET_ID,
  SEED_WARRANTY_SIMULATION_ID,
} from "./seeds.ts"

/**
 * Invariance contract for the canonical bootstrap scope. If any of these
 * fail, `pnpm seed` will produce different rows than before — a
 * regression. Add an assertion here whenever a new fixture key gets
 * threaded through the seeders so the bootstrap path stays byte-identical.
 */
describe("bootstrapSeedScope — invariance with seeds.ts literals", () => {
  it("carries the canonical org / project / anchor / queue assignees", () => {
    expect(bootstrapSeedScope.organizationId).toBe(SEED_ORG_ID)
    expect(bootstrapSeedScope.projectId).toBe(SEED_PROJECT_ID)
    expect(bootstrapSeedScope.timelineAnchor).toBe(SEED_TIMELINE_ANCHOR)
    expect(bootstrapSeedScope.queueAssigneeUserIds).toEqual([...SEED_MANUAL_QUEUE_ASSIGNEES])
  })

  it("resolves dataset cuids to seeds.ts literals", () => {
    expect(bootstrapSeedScope.cuid("dataset:warranty")).toBe(SEED_WARRANTY_DATASET_ID)
    expect(bootstrapSeedScope.cuid("dataset:combination")).toBe(SEED_DATASET_ID)
  })

  it("resolves evaluation cuids to seeds.ts literals", () => {
    expect(bootstrapSeedScope.cuid("evaluation:warranty-active")).toBe(SEED_EVALUATION_ID)
  })

  it("resolves named issue cuids and uuids to seeds.ts literals", () => {
    expect(bootstrapSeedScope.cuid("issue:warranty-fab")).toBe(SEED_ISSUE_ID)
    expect(bootstrapSeedScope.uuid("issue:warranty-fab:uuid")).toBe(SEED_ISSUE_UUID)
  })

  it("resolves the 128 long-tail issue ids and uuids by index", () => {
    for (let i = 0; i < SEED_EXTRA_ISSUE_IDS.length; i++) {
      expect(bootstrapSeedScope.cuid(`issue:extra:${i}`)).toBe(SEED_EXTRA_ISSUE_IDS[i])
      expect(bootstrapSeedScope.uuid(`issue:extra:${i}:uuid`)).toBe(SEED_EXTRA_ISSUE_UUIDS[i])
    }
  })

  it("resolves queue / simulation / score cuids", () => {
    expect(bootstrapSeedScope.cuid("queue:warranty")).toBe(SEED_ANNOTATION_QUEUE_WARRANTY_ID)
    expect(bootstrapSeedScope.cuid("simulation:warranty")).toBe(SEED_WARRANTY_SIMULATION_ID)
    expect(bootstrapSeedScope.cuid("score:passed")).toBe(SEED_SCORE_PASSED_ID)
    expect(bootstrapSeedScope.cuid("score:ui-polish:human-draft-1")).toBe(SEED_UI_POLISH_SCORE_IDS.humanDraft1)
  })

  it("resolves trace hex via prefix mapping (matches the existing fixedTraceHex output)", () => {
    // Shape: <prefix:2><index hex padded to 6><24 zeros> = 32 chars total.
    expect(bootstrapSeedScope.traceHex("annotation", 0)).toBe(`af000000${"0".repeat(24)}`)
    expect(bootstrapSeedScope.traceHex("annotation", 5)).toBe(`af000005${"0".repeat(24)}`)
  })

  it("resolves alignment-fixture trace hex with the +100 index offset", () => {
    // SEED_ALIGNMENT_FIXTURE_TRACE_IDS[0] = fixedTraceHex("bf", 100) → "bf00006400000000000000000000000".padded
    // index 100 in hex is "64", padded to 6 chars: "000064"
    expect(bootstrapSeedScope.traceHex("alignment-fixture", 0)).toBe(`bf000064${"0".repeat(24)}`)
    expect(bootstrapSeedScope.traceHex("alignment-fixture", 5)).toBe(`bf000069${"0".repeat(24)}`)
  })

  it("resolves the 5 lifecycle trace literals directly (not patterned)", () => {
    for (let i = 0; i < SEED_LIFECYCLE_TRACE_IDS.length; i++) {
      expect(bootstrapSeedScope.traceHex("lifecycle", i)).toBe(SEED_LIFECYCLE_TRACE_IDS[i])
    }
  })

  it("resolves the annotation-demo trace/span literals", () => {
    expect(bootstrapSeedScope.traceHex("annotation-demo", 0)).toBe(SEED_ANNOTATION_DEMO_TRACE_ID)
  })

  it("falls through to derivation for unknown keys (forward-compat)", () => {
    // A new fixture key the bootstrap map doesn't know about must produce
    // a deterministic value (not throw, not return undefined).
    const id = bootstrapSeedScope.cuid("dataset:future-fixture")
    expect(id).toMatch(/^[a-f0-9]{24}$/)
  })

  it("preserves the legacy seedScoreId pattern for score-prefix keys", () => {
    // Pre-refactor `seedScoreId(prefix, index)` produced
    // `${prefix}${index padded 3}${'x' * remaining}`. With score ids now
    // resolved via `scope.cuid("score:<prefix>:<index>")`, the bootstrap
    // override must round-trip those keys back to the same literal so
    // `pnpm seed` is byte-identical and `scores.id` doesn't shift.
    expect(bootstrapSeedScope.cuid("score:i1:0")).toBe(`i1000${"x".repeat(19)}`)
    expect(bootstrapSeedScope.cuid("score:i2:5")).toBe(`i2005${"x".repeat(19)}`)
    expect(bootstrapSeedScope.cuid("score:al:12")).toBe(`al012${"x".repeat(19)}`)
    expect(bootstrapSeedScope.cuid("score:io:128")).toBe(`io128${"x".repeat(19)}`)
  })
})
