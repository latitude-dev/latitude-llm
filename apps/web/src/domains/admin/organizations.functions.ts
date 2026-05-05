import {
  type AdminOrganizationDetails,
  type AdminOrganizationUsageCursor,
  type AdminOrganizationUsageSummary,
  adminOrganizationUsageCursorSchema,
  createDemoProjectUseCase,
  getOrganizationDetailsUseCase,
  type ListOrganizationsByUsageOutput,
  listOrganizationsByUsageUseCase,
  ORGANIZATION_USAGE_MAX_LIMIT,
} from "@domain/admin"
import {
  type BillingOverride,
  BillingOverrideRepository,
  BillingUsagePeriodRepository,
  calculatePlanSpendMicrocents,
  resolveEffectivePlan,
  StripeSubscriptionLookup,
} from "@domain/billing"
import { WorkflowStarter } from "@domain/queue"
import { generateId, OrganizationId, UserId } from "@domain/shared"
import { AdminOrganizationUsageRepositoryLive, withClickHouse } from "@platform/db-clickhouse"
import {
  AdminOrganizationRepositoryLive,
  BillingOverrideRepositoryLive,
  BillingUsagePeriodRepositoryLive,
  OutboxEventWriterLive,
  ProjectRepositoryLive,
  SettingsReaderLive,
  StripeSubscriptionLookupLive,
  withPostgres,
} from "@platform/db-postgres"
import { withTracing } from "@repo/observability"
import { createServerFn } from "@tanstack/react-start"
import { Effect, Layer } from "effect"
import { z } from "zod"
import { adminMiddleware } from "../../server/admin-middleware.ts"
import { getAdminPostgresClient, getClickhouseClient, getWorkflowStarter } from "../../server/clients.ts"

export interface AdminOrganizationMemberDto {
  membershipId: string
  role: "owner" | "admin" | "member"
  user: {
    id: string
    email: string
    name: string | null
    image: string | null
    role: "user" | "admin"
  }
}

export interface AdminOrganizationProjectDto {
  id: string
  name: string
  slug: string
  createdAt: string
}

interface AdminOrganizationDetailsDto {
  id: string
  name: string
  slug: string
  stripeCustomerId: string | null
  members: AdminOrganizationMemberDto[]
  projects: AdminOrganizationProjectDto[]
  createdAt: string
  updatedAt: string
}

export interface AdminOrganizationBillingDto {
  effectivePlanSlug: "free" | "pro" | "enterprise"
  effectivePlanSource: "override" | "subscription" | "free-fallback"
  stripeSubscriptionPlan: string | null
  stripeSubscriptionStatus: string | null
  periodStart: string
  periodEnd: string
  /** `null` when entitlement is effectively unlimited over JSON/API (Enterprise logical allowance). */
  includedCredits: number | null
  consumedCredits: number
  overageCredits: number
  overageAmountMicrocents: number
  retentionDays: number
  currentSpendMicrocents: number | null
  spendingLimitCents: number | null
  override: {
    plan: "free" | "pro" | "enterprise"
    includedCredits: number | null
    retentionDays: number | null
    notes: string | null
    updatedAt: string
  } | null
}

const toDto = (details: AdminOrganizationDetails): AdminOrganizationDetailsDto => ({
  id: details.id,
  name: details.name,
  slug: details.slug,
  stripeCustomerId: details.stripeCustomerId,
  members: details.members.map((m) => ({
    membershipId: m.membershipId,
    role: m.role,
    user: {
      id: m.user.id,
      email: m.user.email,
      name: m.user.name,
      image: m.user.image,
      role: m.user.role,
    },
  })),
  projects: details.projects.map((p) => ({
    id: p.id,
    name: p.name,
    slug: p.slug,
    createdAt: p.createdAt.toISOString(),
  })),
  createdAt: details.createdAt.toISOString(),
  updatedAt: details.updatedAt.toISOString(),
})

/**
 * Exported for input-schema tests.
 */
export const adminGetOrganizationInputSchema = z.object({
  organizationId: z.string().min(1).max(256),
})

const adminUpdateOrganizationBillingOverrideInputSchema = z.object({
  organizationId: z.string().min(1).max(256),
  plan: z.enum(["free", "pro", "enterprise"]),
  includedCredits: z.number().int().nonnegative().nullable(),
  retentionDays: z.number().int().positive().nullable(),
  notes: z.string().nullable(),
})

/**
 * Backoffice organisation-detail fetch.
 *
 * Guard: {@link adminMiddleware} — runs before validation, rejects
 * non-admins with `NotFoundError` (identical to hitting a non-existent
 * server function). Queries use {@link getAdminPostgresClient} +
 * `withPostgres` at the default `OrganizationId("system")` scope —
 * the only sanctioned RLS-bypass signal.
 */
export const adminGetOrganization = createServerFn({ method: "GET" })
  .middleware([adminMiddleware])
  .inputValidator(adminGetOrganizationInputSchema)
  .handler(async ({ data }): Promise<AdminOrganizationDetailsDto> => {
    const client = getAdminPostgresClient()

    const details = await Effect.runPromise(
      getOrganizationDetailsUseCase({ organizationId: OrganizationId(data.organizationId) }).pipe(
        withPostgres(AdminOrganizationRepositoryLive, client),
        withTracing,
      ),
    )

    return toDto(details)
  })

export const adminGetOrganizationBilling = createServerFn({ method: "POST" })
  .middleware([adminMiddleware])
  .inputValidator(adminGetOrganizationInputSchema)
  .handler(async ({ data }): Promise<AdminOrganizationBillingDto> => {
    const client = getAdminPostgresClient()
    const organizationId = OrganizationId(data.organizationId)

    return await Effect.runPromise(
      Effect.gen(function* () {
        const orgPlan = yield* resolveEffectivePlan(organizationId)
        const overrideRepo = yield* BillingOverrideRepository
        const periodRepo = yield* BillingUsagePeriodRepository
        const stripeLookup = yield* StripeSubscriptionLookup

        const [override, period, subscription] = yield* Effect.all([
          overrideRepo.findByOrganizationId(organizationId),
          periodRepo.findByPeriod({
            organizationId,
            periodStart: orgPlan.periodStart,
            periodEnd: orgPlan.periodEnd,
          }),
          stripeLookup.findActiveByOrganizationId(organizationId),
        ])

        return {
          effectivePlanSlug: orgPlan.plan.slug,
          effectivePlanSource: orgPlan.source as AdminOrganizationBillingDto["effectivePlanSource"],
          stripeSubscriptionPlan: subscription?.plan ?? null,
          stripeSubscriptionStatus: subscription?.status ?? null,
          periodStart: orgPlan.periodStart.toISOString(),
          periodEnd: orgPlan.periodEnd.toISOString(),
          includedCredits: Number.isFinite(orgPlan.plan.includedCredits) ? orgPlan.plan.includedCredits : null,
          consumedCredits: period?.consumedCredits ?? 0,
          overageCredits: period?.overageCredits ?? 0,
          overageAmountMicrocents: period?.overageAmountMicrocents ?? 0,
          retentionDays: orgPlan.plan.retentionDays,
          currentSpendMicrocents: calculatePlanSpendMicrocents(orgPlan.plan.slug, period?.overageAmountMicrocents ?? 0),
          spendingLimitCents: orgPlan.plan.spendingLimitCents,
          override: override
            ? {
                plan: override.plan,
                includedCredits: override.includedCredits,
                retentionDays: override.retentionDays,
                notes: override.notes,
                updatedAt: override.updatedAt.toISOString(),
              }
            : null,
        } satisfies AdminOrganizationBillingDto
      }).pipe(
        withPostgres(
          Layer.mergeAll(
            BillingOverrideRepositoryLive,
            BillingUsagePeriodRepositoryLive,
            SettingsReaderLive,
            StripeSubscriptionLookupLive,
          ),
          client,
        ),
        withTracing,
      ),
    )
  })

export const adminUpdateOrganizationBillingOverride = createServerFn({ method: "POST" })
  .middleware([adminMiddleware])
  .inputValidator(adminUpdateOrganizationBillingOverrideInputSchema)
  .handler(async ({ data }): Promise<void> => {
    const client = getAdminPostgresClient()
    const organizationId = OrganizationId(data.organizationId)

    await Effect.runPromise(
      Effect.gen(function* () {
        const repo = yield* BillingOverrideRepository
        const existing = yield* repo.findByOrganizationId(organizationId)
        const now = new Date()

        const override: BillingOverride = {
          id: existing?.id ?? generateId(),
          organizationId,
          plan: data.plan,
          includedCredits: data.includedCredits,
          retentionDays: data.retentionDays,
          notes: data.notes,
          createdAt: existing?.createdAt ?? now,
          updatedAt: now,
        }

        yield* repo.upsert(override)
      }).pipe(withPostgres(BillingOverrideRepositoryLive, client), withTracing),
    )
  })

export const adminClearOrganizationBillingOverride = createServerFn({ method: "POST" })
  .middleware([adminMiddleware])
  .inputValidator(adminGetOrganizationInputSchema)
  .handler(async ({ data }): Promise<void> => {
    const client = getAdminPostgresClient()
    const organizationId = OrganizationId(data.organizationId)

    await Effect.runPromise(
      Effect.gen(function* () {
        const repo = yield* BillingOverrideRepository
        yield* repo.deleteByOrganizationId(organizationId)
      }).pipe(withPostgres(BillingOverrideRepositoryLive, client), withTracing),
    )
  })

// ───────────────────────────────────────────────────────────────────
// Organisations by usage (backoffice listing)
// ───────────────────────────────────────────────────────────────────

export interface AdminOrganizationUsageItemDto {
  id: string
  name: string
  slug: string
  plan: string | null
  memberCount: number
  traceCount: number
  /** ISO-8601, or null when the org has no traces in the rolling window. */
  lastTraceAt: string | null
  createdAt: string
}

interface AdminOrganizationUsagePageDto {
  items: AdminOrganizationUsageItemDto[]
  /** Opaque, base64url-encoded next-page cursor; null when there's no more data. */
  nextCursor: string | null
}

const toUsageItemDto = (item: AdminOrganizationUsageSummary): AdminOrganizationUsageItemDto => ({
  id: item.id,
  name: item.name,
  slug: item.slug,
  plan: item.plan,
  memberCount: item.memberCount,
  traceCount: item.traceCount,
  lastTraceAt: item.lastTraceAt ? item.lastTraceAt.toISOString() : null,
  createdAt: item.createdAt.toISOString(),
})

const toUsagePageDto = (page: ListOrganizationsByUsageOutput): AdminOrganizationUsagePageDto => ({
  items: page.items.map(toUsageItemDto),
  nextCursor: page.nextCursor ? encodeUsageCursor(page.nextCursor) : null,
})

const encodeUsageCursor = (cursor: AdminOrganizationUsageCursor): string =>
  Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url")

// Decoding lives inside the Zod schema (below) so a malformed cursor surfaces
// as an input validation error (4xx) instead of an unhandled exception (500).
// The cursor is opaque to the client, so a bad value is almost always a bug,
// but client-controlled query params shouldn't crash the handler.
export const adminListOrganizationsByUsageInputSchema = z.object({
  cursor: z
    .string()
    .min(1)
    .max(1024)
    .optional()
    .transform((value, ctx) => {
      if (value === undefined) return undefined
      try {
        const decoded = Buffer.from(value, "base64url").toString("utf8")
        return adminOrganizationUsageCursorSchema.parse(JSON.parse(decoded))
      } catch {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid cursor" })
        return z.NEVER
      }
    }),
  limit: z.number().int().positive().max(ORGANIZATION_USAGE_MAX_LIMIT).optional(),
})

/**
 * Backoffice "organisations by usage" listing. Sorted by trace count over
 * the rolling 30-day window (descending), with org id as the tiebreaker so
 * pagination is deterministic.
 *
 * Guard: {@link adminMiddleware}. Postgres queries run on the admin client
 * at the `"system"` org scope (RLS bypass); ClickHouse aggregates `traces`
 * cross-tenant via the dedicated admin port — see the security warnings on
 * `AdminOrganizationUsageRepositoryLive` and `AdminOrganizationRepositoryLive`.
 */
export const adminListOrganizationsByUsage = createServerFn({ method: "GET" })
  .middleware([adminMiddleware])
  .inputValidator(adminListOrganizationsByUsageInputSchema)
  .handler(async ({ data }): Promise<AdminOrganizationUsagePageDto> => {
    const page = await Effect.runPromise(
      listOrganizationsByUsageUseCase({
        ...(data.cursor ? { cursor: data.cursor } : {}),
        ...(data.limit !== undefined ? { limit: data.limit } : {}),
      }).pipe(
        withPostgres(AdminOrganizationRepositoryLive, getAdminPostgresClient()),
        withClickHouse(AdminOrganizationUsageRepositoryLive, getClickhouseClient()),
        withTracing,
      ),
    )

    return toUsagePageDto(page)
  })

// ───────────────────────────────────────────────────────────────────
// Create demo project (backoffice action)
// ───────────────────────────────────────────────────────────────────

/**
 * Exported for input-schema tests.
 */
export const adminCreateDemoProjectInputSchema = z.object({
  organizationId: z.string().min(1).max(256),
  /** User-typed name from the modal. Trimmed and validated server-side. */
  projectName: z.string().min(1).max(256),
})

interface AdminCreateDemoProjectResultDto {
  projectId: string
  projectSlug: string
  /** The org member chosen as queue-item assignee for the seeded annotation queues. */
  queueAssigneeUserId: string
}

/**
 * Create a "demo project" on the target organization and kick off the
 * Temporal workflow that seeds it with full bootstrap content (datasets,
 * evaluations, issues, queues, scores, ~30 days of telemetry).
 *
 * Three-guard discipline mirroring the rest of the backoffice:
 *  - {@link adminMiddleware} rejects non-admins with `NotFoundError`
 *    (indistinguishable from a non-existent server function).
 *  - Use-case enforces name-collision / empty-org-members invariants
 *    before any side effect.
 *  - Postgres reads/writes go through {@link getAdminPostgresClient}
 *    (the only sanctioned RLS-bypass signal).
 *
 * The server function returns as soon as the project row + audit event
 * commit and Temporal accepts the workflow handle. Seeding runs in the
 * background — the UI just `router.invalidate()`s and lets the staff
 * refresh to watch the project's content fill in.
 */
export const adminCreateDemoProject = createServerFn({ method: "POST" })
  .middleware([adminMiddleware])
  .inputValidator(adminCreateDemoProjectInputSchema)
  .handler(async ({ data, context }): Promise<AdminCreateDemoProjectResultDto> => {
    const client = getAdminPostgresClient()
    const workflowStarter = await getWorkflowStarter()

    const result = await Effect.runPromise(
      createDemoProjectUseCase({
        organizationId: OrganizationId(data.organizationId),
        projectName: data.projectName,
        actorAdminUserId: UserId(context.adminUserId),
      }).pipe(
        withPostgres(
          Layer.mergeAll(AdminOrganizationRepositoryLive, ProjectRepositoryLive, OutboxEventWriterLive),
          client,
        ),
        Effect.provideService(WorkflowStarter, workflowStarter),
        withTracing,
      ),
    )

    return {
      projectId: result.projectId,
      projectSlug: result.projectSlug,
      queueAssigneeUserId: result.queueAssigneeUserId,
    }
  })
