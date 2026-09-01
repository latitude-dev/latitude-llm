import { provisionPartnerAccountUseCase } from "@domain/partners"
import { generateId, isConflictError, type OrganizationId } from "@domain/shared"
import type { OpenAPIHono } from "@hono/zod-openapi"
import {
  MembershipRepositoryLive,
  OAuthGrantRepositoryLive,
  OrganizationRepositoryLive,
  OutboxEventWriterLive,
  type PostgresClient,
  UserRepositoryLive,
  withPostgres,
} from "@platform/db-postgres"
import { withTracing } from "@repo/observability"
import { Cause, Effect, Exit, Layer } from "effect"
import { z } from "zod"
import { getAdminPostgresClient } from "../clients.ts"
import { createPartnerAuthMiddleware } from "../middleware/partner-auth.ts"
import { createGlobalRateLimiter, createPartnerRateLimiter } from "../middleware/rate-limiter.ts"
import type { AppEnv } from "../types.ts"

const PROVISION_PATH = "/private/partners/:partnerId/accounts"

// A provisioned user never sees the onboarding form, so the partner can supply everything that
// form would have collected. Only the email is required; the rest is derived when omitted.
const ProvisionAccountBody = z.object({
  user: z.object({
    email: z.string().email(),
    name: z.string().max(256).optional(),
    // Rendered as an <img> src in the app, so restrict it the same way partner icons are.
    image: z
      .string()
      .regex(/^https?:\/\/\S+$/, "Image must be an http(s) URL")
      .max(2048)
      .optional(),
    phone: z
      .string()
      .regex(/^\+[1-9]\d{4,14}$/, "Phone must be E.164, e.g. +15550100")
      .optional(),
    job: z.string().max(256).optional(),
  }),
  organization: z
    .object({
      name: z.string().min(1).max(256).optional(),
    })
    .optional(),
})

/**
 * Private partner API: creates a Latitude account and an OAuth grant for the
 * calling partner in one signed request — the rows the interactive consent flow
 * would have produced, minus the interaction.
 *
 * A plain `app.post` (never `app.openapi`, never `defineOperation`) so the route
 * is absent from `openapi.json`, `mcp.json`, both SDKs, the CLI and the docs
 * site; the CI manifest drift gate keeps it that way. The raw body is read
 * before parsing because the signature covers the exact bytes — the GitHub
 * webhook pattern.
 *
 * Mounted on `v1` before the auth wall, so it inherits the `v1.use("*")` context
 * injector but not `Authorization`-based auth. Needs the RLS-bypassing admin
 * client: the `oauth_applications` insert is guarded on the very organization
 * being created.
 */
export const registerPartnerRoutes = ({
  app,
  adminDatabase,
}: {
  app: OpenAPIHono<AppEnv>
  adminDatabase: PostgresClient | undefined
}) => {
  const adminClient = adminDatabase ?? getAdminPostgresClient()

  app.use(PROVISION_PATH, createPartnerAuthMiddleware({ requiredScope: "accounts:provision" }))
  app.use(PROVISION_PATH, createPartnerRateLimiter({ maxRequests: 100, windowSeconds: 60 }))
  app.use(
    PROVISION_PATH,
    createGlobalRateLimiter({ key: "partner-account-provision", maxRequests: 1000, windowSeconds: 60 }),
  )

  app.post(PROVISION_PATH, async (c) => {
    const partner = c.get("partner")
    if (!partner) return c.json({ error: "unauthorized" }, 401)

    let parsed: unknown
    try {
      parsed = JSON.parse(await c.req.text())
    } catch {
      return c.json({ error: "invalid_request", details: "Body is not valid JSON" }, 400)
    }

    const body = ProvisionAccountBody.safeParse(parsed)
    if (!body.success) {
      return c.json({ error: "invalid_request", details: body.error.issues }, 400)
    }

    const organizationId: OrganizationId = generateId<"OrganizationId">()
    const result = await Effect.runPromiseExit(
      provisionPartnerAccountUseCase({
        partner,
        organizationId,
        user: {
          email: body.data.user.email,
          name: body.data.user.name,
          image: body.data.user.image,
          phoneNumber: body.data.user.phone,
          jobTitle: body.data.user.job,
        },
        organization: body.data.organization,
      }).pipe(
        withPostgres(
          Layer.mergeAll(
            UserRepositoryLive,
            OrganizationRepositoryLive,
            MembershipRepositoryLive,
            OAuthGrantRepositoryLive,
            OutboxEventWriterLive,
          ),
          adminClient,
          organizationId,
        ),
        withTracing,
      ),
    )

    if (Exit.isFailure(result)) {
      const failure = result.cause.reasons.find(Cause.isFailReason)
      if (failure && isConflictError(failure.error)) {
        return c.json({ error: "account_already_exists" }, 409)
      }
      throw failure?.error ?? new Error("Partner account provisioning failed")
    }

    return c.json(
      {
        access_token: result.value.accessToken,
        refresh_token: result.value.refreshToken,
        token_type: "bearer",
        expires_in: result.value.expiresIn,
        scope: result.value.scope,
        client_id: result.value.clientId,
        organization_id: result.value.organizationId,
        organization_slug: result.value.organizationSlug,
        user_id: result.value.userId,
      },
      201,
    )
  })
}
