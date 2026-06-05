import { InvitationRepository } from "@domain/organizations"
import { InvitationRepositoryLive, withPostgres } from "@platform/db-postgres"
import { withTracing } from "@repo/observability"
import { createServerFn } from "@tanstack/react-start"
import { getRequestHeaders } from "@tanstack/react-start/server"
import { Effect } from "effect"
import z from "zod"
import { SIGNUP_ATTRIBUTION_TTL_SECONDS, signupAttributionKey } from "../../lib/analytics/signup-attribution.ts"
import { getAdminPostgresClient, getBetterAuth, getRedisClient } from "../../server/clients.ts"

const sendMagicLinkInputSchema = z.object({
  email: z.email(),
  callbackURL: z.string().optional(),
  newUserCallbackURL: z.string().optional(),
  captchaToken: z.string().optional(),
  // Browser-captured attribution; stashed by email for `onUserCreated`. Best-effort.
  attribution: z
    .object({
      sessionId: z.string().optional(),
      referrer: z.string().optional(),
      trackingParams: z.record(z.string(), z.string()).optional(),
    })
    .optional(),
})

export const sendMagicLink = createServerFn({ method: "POST" })
  .inputValidator(sendMagicLinkInputSchema)
  .handler(async ({ data }) => {
    const requestHeaders = await getRequestHeaders()
    const headers = new Headers(requestHeaders)
    if (data.captchaToken) {
      headers.set("x-captcha-response", data.captchaToken)
    }

    const attribution = data.attribution
    const hasAttribution =
      !!attribution &&
      (!!attribution.sessionId ||
        !!attribution.referrer ||
        (!!attribution.trackingParams && Object.keys(attribution.trackingParams).length > 0))
    if (hasAttribution) {
      try {
        await getRedisClient().set(
          signupAttributionKey(data.email),
          JSON.stringify(attribution),
          "EX",
          SIGNUP_ATTRIBUTION_TTL_SECONDS,
        )
      } catch {
        // Never block the magic link on attribution.
      }
    }

    await getBetterAuth().api.signInMagicLink({
      body: {
        email: data.email,
        callbackURL: data.callbackURL ?? "/",
        newUserCallbackURL: data.newUserCallbackURL ?? "/welcome",
      },
      headers,
    })
  })

export const setActiveOrganization = createServerFn({ method: "POST" })
  .inputValidator(z.object({ organizationId: z.string(), organizationSlug: z.string() }))
  .handler(async ({ data }) => {
    await getBetterAuth().api.setActiveOrganization({
      body: {
        organizationId: data.organizationId,
        organizationSlug: data.organizationSlug,
      },
      headers: await getRequestHeaders(),
    })
  })

export const getInvitationPreview = createServerFn({ method: "GET" })
  .inputValidator(z.object({ invitationId: z.string() }))
  .handler(async ({ data }) => {
    const client = getAdminPostgresClient()
    return await Effect.runPromise(
      Effect.gen(function* () {
        const repo = yield* InvitationRepository
        return yield* repo
          .findPublicPendingPreviewById(data.invitationId)
          .pipe(Effect.catchTag("NotFoundError", () => Effect.succeed(null)))
      }).pipe(withPostgres(InvitationRepositoryLive, client), withTracing),
    )
  })
