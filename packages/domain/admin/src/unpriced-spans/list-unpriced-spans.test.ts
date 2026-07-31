import { OrganizationId, ProjectId } from "@domain/shared"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { AdminProjectRepository, type AdminProjectSummary } from "../projects/project-repository.ts"
import { listUnpricedSpansUseCase } from "./list-unpriced-spans.ts"
import { AdminUnpricedSpanRepository, type AdminUnpricedSpanSlice } from "./unpriced-span-repository.ts"

const NOW = new Date("2026-08-01T00:00:00.000Z")
const ORG = OrganizationId("org-1")

const slice = (over: Partial<AdminUnpricedSpanSlice> = {}): AdminUnpricedSpanSlice => ({
  organizationId: ORG,
  projectId: ProjectId("proj-1"),
  provider: "anthropic",
  model: "qwen3.7-max",
  spans: 10,
  tokens: 1_000,
  firstSeenAt: new Date("2026-07-30T10:00:00.000Z"),
  lastOccurrenceAt: new Date("2026-07-31T10:00:00.000Z"),
  ...over,
})

const summary = (id: string, name: string): AdminProjectSummary => ({
  id: ProjectId(id),
  name,
  slug: name.toLowerCase(),
  organizationId: ORG,
  organizationName: "Acme Inc.",
  organizationSlug: "acme",
})

function run(slices: readonly AdminUnpricedSpanSlice[], summaries: ReadonlyMap<ProjectId, AdminProjectSummary>) {
  const spanRepo = Layer.succeed(AdminUnpricedSpanRepository, {
    listUnpricedSlices: () => Effect.succeed(slices),
  })
  const projectRepo = Layer.succeed(AdminProjectRepository, {
    findById: () => Effect.die("unused by this use-case"),
    getCurrentSignalStateCounts: () => Effect.die("unused by this use-case"),
    getSignalLifecycleEvents: () => Effect.die("unused by this use-case"),
    findSignalDetailsByIds: () => Effect.die("unused by this use-case"),
    findManySummariesByIds: () => Effect.succeed(summaries),
  })

  return Effect.runPromise(
    listUnpricedSpansUseCase({ now: NOW }).pipe(Effect.provide(Layer.mergeAll(spanRepo, projectRepo))),
  )
}

describe("listUnpricedSpansUseCase", () => {
  it("collapses one provider/model pair across orgs and projects into a single row", async () => {
    const result = await run(
      [
        slice({ projectId: ProjectId("proj-1"), spans: 10, tokens: 1_000 }),
        slice({
          projectId: ProjectId("proj-2"),
          organizationId: OrganizationId("org-2"),
          spans: 5,
          tokens: 9_000,
          lastOccurrenceAt: new Date("2026-07-31T18:00:00.000Z"),
        }),
      ],
      new Map([
        [ProjectId("proj-1"), summary("proj-1", "Alpha")],
        [ProjectId("proj-2"), summary("proj-2", "Beta")],
      ]),
    )

    expect(result.pairs).toHaveLength(1)
    const pair = result.pairs[0]!
    expect(pair.spans).toBe(15)
    expect(pair.tokens).toBe(10_000)
    expect(pair.lastOccurrenceAt).toEqual(new Date("2026-07-31T18:00:00.000Z"))
    // Both projects stay visible, largest consumer first, so a fix's blast radius is legible.
    expect(pair.projects.map((p) => [p.projectName, p.tokens])).toEqual([
      ["Beta", 9_000],
      ["Alpha", 1_000],
    ])
  })

  it("renders the bare id for a project deleted after its spans were ingested", async () => {
    const result = await run([slice({ projectId: ProjectId("gone") })], new Map())

    expect(result.pairs[0]!.projects[0]).toMatchObject({ projectId: "gone", projectName: null })
  })

  it("parks a pair the derived rules rule out, without needing a recorded decision", async () => {
    const result = await run([slice({ provider: "lmstudio", model: "zai-org/glm-4.7-flash" })], new Map())

    expect(result.pairs[0]!.state).toBe("wontFix")
    expect(result.pairs[0]!.triage).toBeNull()
    expect(result.pairs[0]!.unpriceableReason).toBe("localRuntime")
  })

  it("parks a pair carrying a recorded wontFix decision", async () => {
    const result = await run([slice({ provider: "custom", model: "local-fast" })], new Map())

    expect(result.pairs[0]!.state).toBe("wontFix")
    expect(result.pairs[0]!.triage).toMatchObject({ decision: "wontFix", reason: "neverPriceable" })
  })

  it("resolves a pair the registry prices today, since the rows predate the fix", async () => {
    const result = await run([slice({ provider: "openrouter", model: "x-ai/grok-4.5" })], new Map())

    expect(result.pairs[0]!.cause).toBe("ingestGap")
    expect(result.pairs[0]!.state).toBe("resolved")
  })

  it("keeps a genuine catalog gap in the work queue", async () => {
    const result = await run([slice({ provider: "some-proxy", model: "mystery-model" })], new Map())

    expect(result.pairs[0]!.cause).toBe("missingPricing")
    expect(result.pairs[0]!.state).toBe("active")
  })

  it("ranks regressions above the work queue, then by spend", async () => {
    const result = await run(
      [
        slice({ provider: "some-proxy", model: "big-gap", tokens: 5_000_000 }),
        slice({ provider: "some-proxy", model: "small-gap", tokens: 10 }),
        slice({ provider: "lmstudio", model: "local", tokens: 9_000_000 }),
      ],
      new Map(),
    )

    expect(result.pairs.map((p) => [p.model, p.state])).toEqual([
      ["big-gap", "active"],
      ["small-gap", "active"],
      // Parked pairs sort last however much traffic they carry.
      ["local", "wontFix"],
    ])
  })

  it("resolves a recorded fix while nothing arrives after its date", async () => {
    const result = await run(
      [
        slice({
          provider: "openrouter",
          model: "grok-4.5",
          lastOccurrenceAt: new Date("2026-07-30T12:00:00.000Z"),
        }),
      ],
      new Map(),
    )

    expect(result.pairs[0]?.state).toBe("resolved")
    expect(result.pairs[0]?.triage).toMatchObject({ decision: "fixed", fixedAt: "2026-07-31" })
  })

  it("flags a recorded fix as regressed once spans arrive after its date", async () => {
    const result = await run(
      [
        slice({
          provider: "openrouter",
          model: "grok-4.5",
          // The tripwire compares against end-of-day, so this has to clear 2026-07-31 entirely.
          lastOccurrenceAt: new Date("2026-08-01T06:00:00.000Z"),
        }),
      ],
      new Map(),
    )

    expect(result.pairs[0]?.state).toBe("regressed")
  })

  it("does not treat a fix that stopped occurring as a stale decision", async () => {
    const result = await run([slice({ provider: "some-proxy", model: "mystery-model" })], new Map())

    // A `fixed` entry matching nothing is the fix holding, which is the outcome it was written for.
    expect(result.staleTriage.every((s) => s.entry.decision === "wontFix")).toBe(true)
    expect(result.staleTriage.some((s) => s.entry.model === "grok-4.5")).toBe(false)
  })

  it("reports recorded decisions that no longer match anything in the window", async () => {
    const result = await run([slice({ provider: "some-proxy", model: "mystery-model" })], new Map())

    // Every seeded entry is stale for this input, and none of them is the observed pair.
    expect(result.staleTriage.length).toBeGreaterThan(0)
    expect(result.staleTriage.some((s) => s.entry.model === "mystery-model")).toBe(false)
    expect(result.staleTriage.some((s) => s.entry.model === "local-fast")).toBe(true)
  })
})
