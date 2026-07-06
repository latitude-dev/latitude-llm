import { bootstrapOrganizationUseCase } from "@domain/organizations"
import { generateId, type OrganizationId } from "@domain/shared"
import { createRoute, type OpenAPIHono, z } from "@hono/zod-openapi"
import {
  ApiKeyRepositoryLive,
  OrganizationClaimRepositoryLive,
  OrganizationRepositoryLive,
  OutboxEventWriterLive,
  type PostgresClient,
  ProjectRepositoryLive,
  withPostgres,
} from "@platform/db-postgres"
import { parseEnv } from "@platform/env"
import { withTracing } from "@repo/observability"
import { errorResponse, jsonBody, jsonResponse, PUBLIC_SECURITY } from "@repo/operations/openapi/schemas"
import { Effect, Layer } from "effect"
import { getAdminPostgresClient } from "../clients.ts"
import { createGlobalRateLimiter, createTierRateLimiter } from "../middleware/rate-limiter.ts"
import type { AppEnv } from "../types.ts"

// Unauthenticated bootstrap. Plain `createRoute` (NOT `defineOperation`) keeps it out of the
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
  "x-fern-sdk-group-name": "account",
  "x-fern-sdk-method-name": "bootstrap",
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

  // The unauthenticated bootstrap surface has no CAPTCHA/Turnstile, so a botnet
  // spread across many IPs slips past the per-IP `max` tier. The per-IP limiter
  // runs first (cheaply rejecting a single greedy IP), then a global cap on the
  // total creation rate acts as a second line of defense against distributed abuse.
  app.use("/account/bootstrap", createTierRateLimiter("max"))
  app.use(
    "/account/bootstrap",
    createGlobalRateLimiter({ key: "account-bootstrap", maxRequests: 1000, windowSeconds: 60 }),
  )

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
