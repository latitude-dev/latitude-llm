import type { UserId } from "@domain/shared"
import { type GetAccountResult, getAccountUseCase } from "@domain/users"
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi"
import {
  MembershipRepositoryLive,
  OrganizationRepositoryLive,
  UserRepositoryLive,
  withPostgres,
} from "@platform/db-postgres"
import { withTracing } from "@repo/observability"
import { Effect, Layer } from "effect"
import { defineApiEndpoint } from "../mcp/index.ts"
import { openApiResponses, PROTECTED_SECURITY } from "../openapi/schemas.ts"
import type { OrganizationScopedEnv } from "../types.ts"

export const accountPath = "/account"

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

// Fern uses these to derive the SDK shape: `client.account.get()`. See
// `routes/api-keys.ts` for the longer explanation of why the vendor-extension
// overrides matter even on single-method namespaces.
const accountFernGroup = {
  "x-fern-sdk-group-name": "account",
  "x-fern-sdk-method-name": "get",
} as const

const accountEndpoint = defineApiEndpoint<OrganizationScopedEnv>(accountPath)

const getAccount = accountEndpoint({
  route: createRoute({
    method: "get",
    path: "/",
    name: "getAccount",
    tags: ["Account"],
    ...accountFernGroup,
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
  getAccount.mountHttp(app)
  return app
}
