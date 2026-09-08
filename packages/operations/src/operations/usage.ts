import {
  BILLING_USAGE_CATEGORIES,
  type BillingOverview,
  type BillingUsageCategoryTotal,
  type BillingUsageProjectTotal,
  getBillingOverviewUseCase,
  getBillingUsageBreakdownUseCase,
  PLAN_SLUGS,
  summarizeBillingUsageByCategory,
  summarizeBillingUsageByProject,
} from "@domain/billing"
import { type Project, ProjectRepository } from "@domain/projects"
import { createRoute, z } from "@hono/zod-openapi"
import { RedisCacheStoreLive } from "@platform/cache-redis"
import {
  BillingOverrideRepositoryLive,
  BillingUsageEventRepositoryLive,
  BillingUsagePeriodRepositoryLive,
  OrganizationRepositoryLive,
  ProjectRepositoryLive,
  resolveEffectivePlanCached,
  SettingsReaderLive,
  StripeSubscriptionLookupLive,
  withPostgres,
} from "@platform/db-postgres"
import { withTracing } from "@repo/observability"
import { Effect, Layer } from "effect"
import { defineOperation } from "../core/define-operation.ts"
import type { OperationModule } from "../core/mount.ts"
import { PROTECTED_SECURITY, ProjectParamsSchema, typedResponses } from "../openapi/schemas.ts"
import type { OrganizationScopedEnv } from "../types.ts"

const usagePath = "/usage"
const projectUsagePath = "/projects/:projectSlug/usage"

const usageOperation = defineOperation<OrganizationScopedEnv>(usagePath)
const projectUsageOperation = defineOperation<OrganizationScopedEnv>(projectUsagePath)

const billingLayers = Layer.mergeAll(
  BillingOverrideRepositoryLive,
  BillingUsageEventRepositoryLive,
  BillingUsagePeriodRepositoryLive,
  OrganizationRepositoryLive,
  ProjectRepositoryLive,
  SettingsReaderLive,
  StripeSubscriptionLookupLive,
)

const UsageCategorySchema = z
  .object({
    category: z.enum(BILLING_USAGE_CATEGORIES).describe("Product area the credits were spent on."),
    credits: z.number().int().describe("Credits spent in this category during the period."),
  })
  .openapi("UsageCategory")

const UsageProjectSchema = z
  .object({
    id: z.string().describe("Stable project identifier."),
    slug: z.string().nullable().describe("Project slug. `null` when the project no longer exists."),
    name: z.string().nullable().describe("Project name. `null` when the project no longer exists."),
    credits: z.number().int().describe("Credits the project spent during the period."),
    categories: z.array(UsageCategorySchema).describe("The project's credits by product area, largest first."),
  })
  .openapi("UsageProject")

const UsagePeriodSchema = z
  .object({
    start: z.string().describe("ISO-8601 start of the current billing period."),
    end: z.string().describe("ISO-8601 end of the current billing period, exclusive."),
  })
  .describe("Billing period the usage figures cover.")

const UsageResponseSchema = z
  .object({
    plan: z.enum(PLAN_SLUGS).describe("Billing plan the organization is on."),
    period: UsagePeriodSchema,
    credits: z
      .object({
        included: z
          .number()
          .int()
          .nullable()
          .describe("Credits included in the plan for the period. `null` when the plan is unlimited."),
        consumed: z.number().int().describe("Credits used so far this period, overage included."),
        remaining: z
          .number()
          .int()
          .nullable()
          .describe("Included credits still available. `null` when the plan is unlimited."),
        overage: z.number().int().describe("Credits used beyond the included allowance."),
      })
      .describe("Credit position for the period."),
    categories: z.array(UsageCategorySchema).describe("Credits by product area across all projects, largest first."),
    projects: z.array(UsageProjectSchema).describe("Credits by project, largest first."),
  })
  .openapi("UsageResponse")

const ProjectUsageResponseSchema = UsageProjectSchema.extend({ period: UsagePeriodSchema }).openapi(
  "ProjectUsageResponse",
)

const getUsage = usageOperation({
  route: createRoute({
    method: "get",
    path: "/",
    name: "getUsage",
    tags: ["Usage"],
    group: "usage",
    sdkMethod: "get",
    summary: "Get usage",
    description:
      "Returns the organization's credit usage for the current billing period, broken down by product area and by project.",
    security: PROTECTED_SECURITY,
    responses: typedResponses({ status: 200, schema: UsageResponseSchema, description: "Current period usage" }),
  }),
  access: "read-only",
  rateLimitTier: "low",
  execute: (_input, ctx) =>
    Effect.gen(function* () {
      const orgPlan = yield* resolveEffectivePlanCached(ctx.organization.id)
      const overview = yield* getBillingOverviewUseCase(orgPlan)
      const rows = yield* getBillingUsageBreakdownUseCase({
        organizationId: ctx.organization.id,
        periodStart: orgPlan.periodStart,
        periodEnd: orgPlan.periodEnd,
      })
      const projectRepo = yield* ProjectRepository
      const projects = yield* projectRepo.listIncludingDeleted()

      return {
        status: 200,
        body: toResponse({
          overview,
          categories: summarizeBillingUsageByCategory(rows, overview.consumedCredits),
          projects: summarizeBillingUsageByProject(rows),
          projectsById: new Map(projects.map((project) => [project.id as string, project])),
        }),
      } as const
    }).pipe(
      withPostgres(billingLayers, ctx.postgresClient, ctx.organization.id),
      Effect.provide(RedisCacheStoreLive(ctx.redis)),
      withTracing,
    ),
})

const getProjectUsage = projectUsageOperation({
  route: createRoute({
    method: "get",
    path: "/",
    name: "getProjectUsage",
    tags: ["Projects"],
    group: "projects",
    sdkMethod: "usage",
    summary: "Get project usage",
    description: "Returns the credits one project spent in the current billing period, broken down by product area.",
    security: PROTECTED_SECURITY,
    request: { params: ProjectParamsSchema },
    responses: typedResponses({
      status: 200,
      schema: ProjectUsageResponseSchema,
      description: "Current period usage for the project",
    }),
  }),
  access: "read-only",
  rateLimitTier: "low",
  execute: (input, ctx) =>
    Effect.gen(function* () {
      const projectRepo = yield* ProjectRepository
      const project = yield* projectRepo.findBySlug(input.params.projectSlug)
      const orgPlan = yield* resolveEffectivePlanCached(ctx.organization.id)
      const rows = yield* getBillingUsageBreakdownUseCase({
        organizationId: ctx.organization.id,
        periodStart: orgPlan.periodStart,
        periodEnd: orgPlan.periodEnd,
      })
      const usage = summarizeBillingUsageByProject(rows.filter((row) => row.projectId === project.id))[0]

      return {
        status: 200,
        body: {
          id: project.id as string,
          slug: project.slug,
          name: project.name,
          credits: usage?.credits ?? 0,
          categories: (usage?.categories ?? []).map((entry) => ({ category: entry.category, credits: entry.credits })),
          period: { start: orgPlan.periodStart.toISOString(), end: orgPlan.periodEnd.toISOString() },
        },
      } as const
    }).pipe(
      withPostgres(billingLayers, ctx.postgresClient, ctx.organization.id),
      Effect.provide(RedisCacheStoreLive(ctx.redis)),
      withTracing,
    ),
})

const toResponse = (input: {
  readonly overview: BillingOverview
  readonly categories: readonly BillingUsageCategoryTotal[]
  readonly projects: readonly BillingUsageProjectTotal[]
  readonly projectsById: ReadonlyMap<string, Project>
}): z.infer<typeof UsageResponseSchema> => ({
  plan: input.overview.planSlug,
  period: {
    start: input.overview.periodStart.toISOString(),
    end: input.overview.periodEnd.toISOString(),
  },
  credits: {
    included: input.overview.includedCredits,
    consumed: input.overview.consumedCredits,
    remaining: input.overview.remainingCredits,
    overage: input.overview.overageCredits,
  },
  categories: input.categories.map((entry) => ({ category: entry.category, credits: entry.credits })),
  projects: input.projects.map((entry) => {
    const project = input.projectsById.get(entry.projectId)
    return {
      id: entry.projectId,
      slug: project?.slug ?? null,
      name: project?.name ?? null,
      credits: entry.credits,
      categories: entry.categories.map((category) => ({ category: category.category, credits: category.credits })),
    }
  }),
})

export const usageModule: OperationModule = {
  path: usagePath,
  operations: [getUsage],
}

export const projectUsageModule: OperationModule = {
  path: projectUsagePath,
  operations: [getProjectUsage],
}
