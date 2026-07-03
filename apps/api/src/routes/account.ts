import { bootstrapOrganizationUseCase } from "@domain/organizations"
import { generateId, type OrganizationId, type UserId } from "@domain/shared"
import { type GetAccountResult, getAccountUseCase } from "@domain/users"
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi"
import {
  ApiKeyRepositoryLive,
  MembershipRepositoryLive,
  OrganizationClaimRepositoryLive,
  OrganizationRepositoryLive,
  OutboxEventWriterLive,
  type PostgresClient,
  ProjectRepositoryLive,
  UserRepositoryLive,
  withPostgres,
} from "@platform/db-postgres"
import { parseEnv } from "@platform/env"
import { withTracing } from "@repo/observability"
import { Effect, Layer } from "effect"
import { getAdminPostgresClient } from "../clients.ts"
import { defineApiEndpoint } from "../mcp/index.ts"
import { createTierRateLimiter } from "../middleware/rate-limiter.ts"
import {
  errorResponse,
  jsonBody,
  jsonResponse,
  openApiResponses,
  PROTECTED_SECURITY,
  PUBLIC_SECURITY,
} from "../openapi/schemas.ts"
import type { AppEnv, OrganizationScopedEnv } from "../types.ts"

export const accountPath = "/account"

// Explicit SDK group/method names so Fern emits `client.account.get()/.bootstrap()` (see `routes/api-keys.ts`).
const accountFernGroup = (methodName: string) =>
  ({
    "x-fern-sdk-group-name": "account",
    "x-fern-sdk-method-name": methodName,
  }) as const

const accountEndpoint = defineApiEndpoint<OrganizationScopedEnv>(accountPath)

const UserSchema = z
  .object({
    id: z.string().describe("Stable user identifier across the API."),
    email: z.string().describe("Verified email address of the authenticated user."),
    name: z.string().nullable().describe("Display name, when set. `null` until the user completes onboarding."),
    image: z.string().nullable().describe("Profile image URL, when set."),
  })
  .openapi("AccountUser")

const OrganizationSchema = z
  .object({
    id: z.string().describe("Stable organization identifier across the API."),
    name: z.string().describe("Human-readable organization name."),
    slug: z
      .string()
      .describe("URL-safe slug. Regenerated when the organization is renamed — don't use it as a stable key."),
  })
  .openapi("AccountOrganization")

const RoleSchema = z
  .enum(["owner", "admin", "member"])
  .describe("Caller's role in the organization. `null` for API-key callers (no real user behind the credential).")

const AccountResponseSchema = z
  .object({
    user: UserSchema.nullable().describe(
      "The user the request is acting on behalf of. `null` for API-key callers — API keys are org-scoped, not user-scoped.",
    ),
    organization: OrganizationSchema.describe("Organization the request is scoped to."),
    role: RoleSchema.nullable(),
  })
  .openapi("AccountResponse")

const getAccount = accountEndpoint({
  route: createRoute({
    method: "get",
    path: "/",
    name: "getAccount",
    annotations: { readOnlyHint: true, destructiveHint: false },
    tags: ["Account"],
    ...accountFernGroup("get"),
    summary: "Get account",
    description:
      "Returns the caller's account snapshot: the organization the request is scoped to, plus the user record and their role when the request was made by a real user (OAuth). API-key callers receive `user: null` and `role: null` because API keys aren't tied to a specific user.",
    security: PROTECTED_SECURITY,
    responses: openApiResponses({ status: 200, schema: AccountResponseSchema, description: "Account snapshot" }),
  }),
  handler: async (c) => {
    const auth = c.var.auth
    const userId: UserId | null = auth.method === "oauth" ? auth.userId : null

    const result = await Effect.runPromise(
      getAccountUseCase({ organizationId: c.var.organization.id, userId }).pipe(
        withPostgres(
          Layer.mergeAll(UserRepositoryLive, OrganizationRepositoryLive, MembershipRepositoryLive),
          c.var.postgresClient,
          c.var.organization.id,
        ),
        withTracing,
      ),
    )

    return c.json(toResponse(result), 200)
  },
})

const toResponse = (result: GetAccountResult) => ({
  user: result.user
    ? {
        id: result.user.id as string,
        email: result.user.email,
        name: result.user.name,
        image: result.user.image,
      }
    : null,
  organization: {
    id: result.organization.id as string,
    name: result.organization.name,
    slug: result.organization.slug,
  },
  role: result.role,
})

export const createAccountRoutes = () => {
  const app = new OpenAPIHono<OrganizationScopedEnv>()
  getAccount.mountHttp(app, createTierRateLimiter("low"))
  return app
}

// Unauthenticated bootstrap. Plain `createRoute` (NOT `defineApiEndpoint`) keeps it out of the
// OAuth-gated MCP surface (spec §3.1); it still ships in the SDKs + CLI.
const BootstrapRequestSchema = z
  .object({
    organizationName: z
      .string()
      .optional()
      .describe('Name for the temporary organization. If not provided, defaults to "My Organization".'),
    projectName: z
      .string()
      .optional()
      .describe('Name for the project created in the organization. If not provided, defaults to "My Project".'),
    userEmail: z.string().email().optional().describe("Email address to send the claim link to."),
  })
  .openapi("BootstrapAccountBody")

const BootstrapResponseSchema = z
  .object({
    organizationSlug: z.string().describe("Slug of the temporary organization."),
    projectSlug: z.string().describe("Slug of the created project."),
    apiKey: z.string().describe("Organization-scoped API key."),
    claimUrl: z.string().describe("URL to open in a browser to claim ownership of the organization."),
    claimEmail: z
      .string()
      .nullable()
      .describe("Email address the claim link will be sent to, or `null` if none was provided."),
    claimExpiresAt: z
      .string()
      .describe("ISO-8601 timestamp when the claim link expires. The organization is deleted if not claimed by then."),
  })
  .openapi("BootstrapAccountResponse")

const bootstrapRoute = createRoute({
  method: "post",
  path: "/account/bootstrap",
  operationId: "bootstrapAccount",
  tags: ["Account"],
  ...accountFernGroup("bootstrap"),
  summary: "Bootstrap a temporary account",
  description:
    "Creates a temporary organization with an API key and a project, and returns a link to claim ownership of it. Requires no authentication.",
  security: PUBLIC_SECURITY,
  request: { body: jsonBody(BootstrapRequestSchema) },
  responses: {
    201: jsonResponse(BootstrapResponseSchema, "Temporary account created"),
    400: errorResponse("Validation error"),
    429: errorResponse("Rate limit exceeded"),
  },
})

// Mounted on `v1` before the auth-guarded `routes` so it bypasses auth. Needs the RLS-bypassing
// admin client for the owner-less-org + claim inserts; `adminDatabase` is only passed in tests.
export const registerBootstrapRoute = ({
  app,
  adminDatabase,
}: {
  app: OpenAPIHono<AppEnv>
  adminDatabase: PostgresClient | undefined
}) => {
  const adminClient = adminDatabase ?? getAdminPostgresClient()

  app.use("/account/bootstrap", createTierRateLimiter("max"))

  app.openapi(bootstrapRoute, async (c) => {
    const body = c.req.valid("json")
    const webUrl = await Effect.runPromise(parseEnv("LAT_WEB_URL", "string"))
    const organizationId: OrganizationId = generateId<"OrganizationId">()

    const result = await Effect.runPromise(
      bootstrapOrganizationUseCase({
        organizationId,
        organizationName: body.organizationName,
        projectName: body.projectName,
        userEmail: body.userEmail,
        webUrl,
      }).pipe(
        withPostgres(
          Layer.mergeAll(
            OrganizationRepositoryLive,
            OrganizationClaimRepositoryLive,
            ApiKeyRepositoryLive,
            ProjectRepositoryLive,
            OutboxEventWriterLive,
          ),
          adminClient,
          organizationId,
        ),
        withTracing,
      ),
    )

    return c.json(
      {
        organizationSlug: result.organization.slug,
        projectSlug: result.project.slug,
        apiKey: result.apiKey,
        claimUrl: result.claimUrl,
        claimEmail: result.claimEmail,
        claimExpiresAt: result.claimExpiresAt.toISOString(),
      },
      201,
    )
  })
}
