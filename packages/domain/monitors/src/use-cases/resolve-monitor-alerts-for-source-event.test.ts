import { MonitorId, OrganizationId, ProjectId, SqlClient } from "@domain/shared"
import { createFakeSqlClient } from "@domain/shared/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import type { Monitor, MonitorAlert } from "../entities/monitor.ts"
import type { MonitorRepositoryShape } from "../ports/monitor-repository.ts"
import { MonitorRepository } from "../ports/monitor-repository.ts"
import { createFakeMonitorRepository } from "../testing/fake-monitor-repository.ts"
import { resolveMonitorAlertsForSourceEventUseCase } from "./resolve-monitor-alerts-for-source-event.ts"

const organizationId = OrganizationId("o".repeat(24))
const projectId = ProjectId("p".repeat(24))
const otherProjectId = ProjectId("q".repeat(24))
const issueId = "i".repeat(24)
const at = new Date("2026-06-01T10:00:00.000Z")

const alert = (input: {
  id: string
  monitorId: string
  kind?: MonitorAlert["kind"]
  source?: MonitorAlert["source"]
  condition?: MonitorAlert["condition"]
  severity?: MonitorAlert["severity"]
}): MonitorAlert => ({
  id: input.id as MonitorAlert["id"],
  monitorId: input.monitorId as MonitorAlert["monitorId"],
  kind: input.kind ?? "issue.new",
  source: input.source ?? { type: "issue", id: null },
  condition: input.condition ?? null,
  severity: input.severity ?? "medium",
  createdAt: at,
})

const monitor = (id: string, alerts: readonly MonitorAlert[], overrides: Partial<Monitor> = {}): Monitor => ({
  id: MonitorId(id),
  organizationId,
  projectId: overrides.projectId ?? projectId,
  slug: overrides.slug ?? `monitor-${id}`,
  name: overrides.name ?? `Monitor ${id}`,
  description: "",
  system: overrides.system ?? true,
  alerts,
  mutedAt: null,
  deletedAt: overrides.deletedAt ?? null,
  createdAt: at,
  updatedAt: at,
})

const run = (
  seed: readonly Monitor[],
  input: { kind: MonitorAlert["kind"]; sourceId: string; projectId?: ProjectId },
) => {
  const { repo } = createFakeMonitorRepository(seed)
  return Effect.runPromise(
    resolveMonitorAlertsForSourceEventUseCase({
      projectId: input.projectId ?? projectId,
      kind: input.kind,
      sourceId: input.sourceId,
    }).pipe(
      Effect.provide(
        Layer.mergeAll(
          Layer.succeed(MonitorRepository, MonitorRepository.of(repo as MonitorRepositoryShape)),
          Layer.succeed(SqlClient, createFakeSqlClient({ organizationId })),
        ),
      ),
    ),
  )
}

describe("resolveMonitorAlertsForSourceEventUseCase", () => {
  it("matches an all-source (source.id null) alert of the event kind", async () => {
    const a = alert({
      id: "a".repeat(24),
      monitorId: "m".repeat(24),
      kind: "issue.new",
      source: { type: "issue", id: null },
    })
    const result = await run([monitor("m".repeat(24), [a])], { kind: "issue.new", sourceId: issueId })
    expect(result.map((r) => r.id)).toEqual([a.id])
  })

  it("matches a named-source alert only for its own source id", async () => {
    const scoped = alert({
      id: "a".repeat(24),
      monitorId: "m".repeat(24),
      kind: "issue.new",
      source: { type: "issue", id: issueId },
    })
    const matched = await run([monitor("m".repeat(24), [scoped])], { kind: "issue.new", sourceId: issueId })
    expect(matched.map((r) => r.id)).toEqual([scoped.id])

    const missed = await run([monitor("m".repeat(24), [scoped])], { kind: "issue.new", sourceId: "z".repeat(24) })
    expect(missed).toEqual([])
  })

  it("does not match alerts of a different kind", async () => {
    const a = alert({ id: "a".repeat(24), monitorId: "m".repeat(24), kind: "issue.regressed" })
    const result = await run([monitor("m".repeat(24), [a])], { kind: "issue.new", sourceId: issueId })
    expect(result).toEqual([])
  })

  it("does not match monitors in another project", async () => {
    const a = alert({ id: "a".repeat(24), monitorId: "m".repeat(24), kind: "issue.new" })
    const result = await run([monitor("m".repeat(24), [a], { projectId: otherProjectId })], {
      kind: "issue.new",
      sourceId: issueId,
    })
    expect(result).toEqual([])
  })

  it("excludes deleted monitors", async () => {
    const a = alert({ id: "a".repeat(24), monitorId: "m".repeat(24), kind: "issue.new" })
    const result = await run([monitor("m".repeat(24), [a], { deletedAt: at })], {
      kind: "issue.new",
      sourceId: issueId,
    })
    expect(result).toEqual([])
  })

  it("returns one alert per matching monitor (fan-out)", async () => {
    const a1 = alert({
      id: "a".repeat(24),
      monitorId: "m".repeat(24),
      kind: "issue.new",
      source: { type: "issue", id: null },
    })
    const a2 = alert({
      id: "b".repeat(24),
      monitorId: "n".repeat(24),
      kind: "issue.new",
      source: { type: "issue", id: issueId },
    })
    const result = await run([monitor("m".repeat(24), [a1]), monitor("n".repeat(24), [a2])], {
      kind: "issue.new",
      sourceId: issueId,
    })
    expect(result.map((r) => r.id).sort()).toEqual([a1.id, a2.id].sort())
  })
})
