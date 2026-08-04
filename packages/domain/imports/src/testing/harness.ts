import {
  BillingUsagePeriodRepository,
  type EffectivePlanResolution,
  ENTERPRISE_PLAN_CONFIG,
  FREE_PLAN_CONFIG,
} from "@domain/billing"
import { createFakeBillingUsagePeriodRepository, seedBillingUsagePeriod } from "@domain/billing/testing"
import { OutboxEventWriter, type OutboxWriteEvent } from "@domain/events"
import { generateId, ImportJobId, OrganizationId, ProjectId, SqlClient, UserId } from "@domain/shared"
import { createFakeSqlClient } from "@domain/shared/testing"
import { Effect, Layer } from "effect"
import { IMPORT_SOURCE_PAGE_SIZE } from "../constants.ts"
import { createImportJob, type ImportJob } from "../entities/import-job.ts"
import type { ImportConfig, ImportCredentials } from "../entities/import-source.ts"
import { ImportJobRepository } from "../ports/import-job-repository.ts"
import { createFakeImportJobRepository, stubImportPlan } from "./fakes.ts"

export const STUB_IMPORT_ORGANIZATION_ID = OrganizationId("o".repeat(24))
export const STUB_IMPORT_PROJECT_ID = ProjectId("p".repeat(24))
export const STUB_IMPORT_ACTOR_ID = UserId("u".repeat(24))

export const STUB_IMPORT_CREDENTIALS: ImportCredentials = {
  kind: "langfuse",
  region: "eu",
  publicKey: "pk-lf-1234567890",
  secretKey: "sk-lf-1234567890",
}

const STUB_IMPORT_BASE_URL = "https://cloud.langfuse.com"

const DAY_MS = 24 * 60 * 60 * 1000

export const stubImportDays = (n: number) => n * DAY_MS

export const STUB_IMPORT_RANGE_TO = new Date("2026-04-01T00:00:00Z")
const STUB_IMPORT_RANGE_DAYS = 90
export const STUB_IMPORT_MAX_TRACES = 250_000

export const stubImportConfig = (overrides: Partial<ImportConfig> = {}): ImportConfig => ({
  sourceProjectId: "lf-project",
  sourceProjectName: "LF Project",
  sourceRegion: "eu",
  sourceBaseUrl: STUB_IMPORT_BASE_URL,
  rangeFrom: new Date(STUB_IMPORT_RANGE_TO.getTime() - stubImportDays(STUB_IMPORT_RANGE_DAYS)),
  rangeTo: STUB_IMPORT_RANGE_TO,
  maxTraces: STUB_IMPORT_MAX_TRACES,
  sourcePageSize: IMPORT_SOURCE_PAGE_SIZE,
  ...overrides,
})

/** A persisted job, `created` unless a status is given — the state creation leaves it in. */
export const stubImportJob = (overrides: Partial<ImportJob> = {}): ImportJob => ({
  ...createImportJob({
    id: ImportJobId(generateId()),
    organizationId: STUB_IMPORT_ORGANIZATION_ID,
    projectId: STUB_IMPORT_PROJECT_ID,
    source: "langfuse",
    config: stubImportConfig(),
    credentials: STUB_IMPORT_CREDENTIALS,
  }),
  ...overrides,
})

/** Unbounded usage and the longest retention, so plan limits stay out of the way by default. */
export const stubEnterprisePlan = (): EffectivePlanResolution =>
  stubImportPlan(STUB_IMPORT_ORGANIZATION_ID, {
    plan: {
      slug: ENTERPRISE_PLAN_CONFIG.slug,
      includedCredits: ENTERPRISE_PLAN_CONFIG.includedCredits,
      retentionDays: ENTERPRISE_PLAN_CONFIG.retentionDays,
      overageAllowed: ENTERPRISE_PLAN_CONFIG.overageAllowed,
      hardCapped: ENTERPRISE_PLAN_CONFIG.hardCapped,
      priceCents: ENTERPRISE_PLAN_CONFIG.priceCents,
    },
  })

/** The binding case: a credit allowance and the shortest retention. */
export const stubFreePlan = (): EffectivePlanResolution =>
  stubImportPlan(STUB_IMPORT_ORGANIZATION_ID, {
    plan: {
      slug: FREE_PLAN_CONFIG.slug,
      includedCredits: FREE_PLAN_CONFIG.includedCredits,
      retentionDays: FREE_PLAN_CONFIG.retentionDays,
      overageAllowed: FREE_PLAN_CONFIG.overageAllowed,
      hardCapped: FREE_PLAN_CONFIG.hardCapped,
      priceCents: FREE_PLAN_CONFIG.priceCents,
    },
  })

interface ImportHarnessOptions {
  /** Jobs already in the repository when the use-case runs. */
  readonly seed?: readonly ImportJob[]
  readonly plan?: EffectivePlanResolution
  /** Seeds the org's usage period, which is what bounds the trace ceiling. */
  readonly consumedCredits?: number
}

/**
 * Everything the job-lifecycle use-cases resolve, with the outbox captured rather than
 * written. `SqlClient` is the fake whose `transaction` is a pass-through, so a use-case's
 * transaction boundary is exercised for composition but does not roll anything back.
 */
export const importHarness = (options: ImportHarnessOptions = {}) => {
  const jobs = createFakeImportJobRepository()
  const written: OutboxWriteEvent[] = []
  const plan = options.plan ?? stubEnterprisePlan()
  const periods = createFakeBillingUsagePeriodRepository()

  for (const job of options.seed ?? []) jobs.jobs.set(job.id, job)

  if (options.consumedCredits !== undefined) {
    Effect.runSync(
      periods.repository
        .upsert(
          seedBillingUsagePeriod({
            organizationId: STUB_IMPORT_ORGANIZATION_ID,
            planSlug: plan.plan.slug,
            periodStart: plan.periodStart,
            periodEnd: plan.periodEnd,
            includedCredits: plan.plan.includedCredits,
            consumedCredits: options.consumedCredits,
          }),
        )
        .pipe(Effect.provideService(SqlClient, createFakeSqlClient({ organizationId: STUB_IMPORT_ORGANIZATION_ID }))),
    )
  }

  return {
    plan,
    written,
    repository: jobs.repository,
    stored: jobs.jobs,
    layer: Layer.mergeAll(
      Layer.succeed(ImportJobRepository, jobs.repository),
      Layer.succeed(BillingUsagePeriodRepository, periods.repository),
      Layer.succeed(SqlClient, createFakeSqlClient({ organizationId: STUB_IMPORT_ORGANIZATION_ID })),
      Layer.succeed(OutboxEventWriter, {
        write: (event) => {
          written.push(event)
          return Effect.void
        },
      }),
    ),
  }
}
