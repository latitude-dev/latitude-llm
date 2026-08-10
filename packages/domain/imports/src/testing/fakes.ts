import { type EffectivePlanResolution, PRO_PLAN_CONFIG } from "@domain/billing"
import { ExternalUserId, OrganizationId, ProjectId, SessionId, SpanId, TraceId } from "@domain/shared"
import type { SpanDetail } from "@domain/spans"
import { stubListSpan } from "@domain/spans/testing"
import { Effect } from "effect"
import type { ImportJob } from "../entities/import-job.ts"
import type { ImportJobRepositoryShape } from "../ports/import-job-repository.ts"

export const createFakeImportJobRepository = (overrides?: Partial<ImportJobRepositoryShape>) => {
  const jobs = new Map<string, ImportJob>()

  const repository: ImportJobRepositoryShape = {
    save: (job) => {
      jobs.set(job.id, job)
      return Effect.void
    },
    findById: (id) => Effect.succeed(jobs.get(id) ?? null),
    listByProjectId: (projectId) => Effect.succeed([...jobs.values()].filter((j) => j.projectId === projectId)),
    findActive: () =>
      Effect.succeed(
        [...jobs.values()].find((j) => j.status === "created" || j.status === "queued" || j.status === "running") ??
          null,
      ),
    updateStatus: (id, status, patch) =>
      Effect.sync(() => {
        const job = jobs.get(id)
        if (!job) return null
        const updated: ImportJob = { ...job, ...patch, status, updatedAt: new Date() }
        jobs.set(id, updated)
        return updated
      }),
    markFailedIfActive: (id, input) =>
      Effect.sync(() => {
        const job = jobs.get(id)
        if (!job || (job.status !== "created" && job.status !== "queued" && job.status !== "running")) return false
        jobs.set(id, {
          ...job,
          status: "failed",
          error: input.error,
          finishedAt: input.finishedAt,
          credentials: null,
          updatedAt: new Date(),
        })
        return true
      }),
    deleteByProjectId: (projectId) =>
      Effect.sync(() => {
        for (const [id, job] of jobs) {
          if (job.projectId === projectId) jobs.delete(id)
        }
      }),
    ...overrides,
  }

  return { repository, jobs }
}

/** Pro-plan resolution, the middle case: overage allowed, no spending limit, 90-day retention. */
export const stubImportPlan = (
  organizationId: OrganizationId,
  overrides: {
    readonly plan?: Partial<EffectivePlanResolution["plan"]>
    readonly periodStart?: Date
    readonly periodEnd?: Date
  } = {},
): EffectivePlanResolution => ({
  organizationId,
  plan: {
    slug: PRO_PLAN_CONFIG.slug,
    includedCredits: PRO_PLAN_CONFIG.includedCredits,
    retentionDays: PRO_PLAN_CONFIG.retentionDays,
    overageAllowed: PRO_PLAN_CONFIG.overageAllowed,
    hardCapped: PRO_PLAN_CONFIG.hardCapped,
    priceCents: PRO_PLAN_CONFIG.priceCents,
    spendingLimitCents: null,
    spanQuotaPerPeriod: PRO_PLAN_CONFIG.spanQuotaPerPeriod,
    sandboxActiveCap: PRO_PLAN_CONFIG.sandboxActiveCap,
    ...overrides.plan,
  },
  source: "subscription",
  periodStart: overrides.periodStart ?? new Date("2026-01-01T00:00:00Z"),
  periodEnd: overrides.periodEnd ?? new Date("2026-02-01T00:00:00Z"),
})

export const stubSpanDetail = (overrides: Partial<SpanDetail> = {}): SpanDetail => ({
  ...stubListSpan({
    organizationId: overrides.organizationId ?? OrganizationId("org1234567890123456789012"),
    projectId: overrides.projectId ?? ProjectId("prj1234567890123456789012"),
    traceId: overrides.traceId ?? TraceId("a".repeat(32)),
    sessionId: overrides.sessionId ?? SessionId(""),
    spanId: overrides.spanId ?? SpanId("b".repeat(16)),
    operation: overrides.operation ?? "chat",
    startTime: overrides.startTime ?? new Date("2026-01-01T00:00:00Z"),
    endTime: overrides.endTime ?? new Date("2026-01-01T00:00:01Z"),
  }),
  userId: ExternalUserId(""),
  name: "fake-span",
  eventsJson: "[]",
  linksJson: "[]",
  ingestedAt: new Date(),
  inputMessages: [],
  outputMessages: [],
  systemInstructions: [],
  toolDefinitions: [],
  toolInput: "",
  toolOutput: "",
  ...overrides,
})
