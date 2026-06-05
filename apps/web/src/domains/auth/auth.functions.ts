import { signupAttributionInputSchema, stashSignupAttribution } from "@domain/marketing"
import { InvitationRepository } from "@domain/organizations"
import { RedisCacheStoreLive } from "@platform/cache-redis"
import { InvitationRepositoryLive, withPostgres } from "@platform/db-postgres"
import { withTracing } from "@repo/observability"
import { createServerFn } from "@tanstack/react-start"
import { getRequestHeaders } from "@tanstack/react-start/server"
import { Effect } from "effect"
import z from "zod"
import { getAdminPostgresClient, getBetterAuth, getRedisClient } from "../../server/clients.ts"

const sendMagicLinkInputSchema = z.object({
  email: z.email(),
  callbackURL: z.string().optional(),
  newUserCallbackURL: z.string().optional(),
  captchaToken: z.string().optional(),
  // Browser-captured attribution; stashed by email for `onUserCreated`. Best-effort.
  attribution: signupAttributionInputSchema.optional(),
})

export const sendMagicLink = createServerFn({ method: "POST" })
  .inputValidator(sendMagicLinkInputSchema)
  .handler(async ({ data }) => {
    const requestHeaders = await getRequestHeaders()
    const headers = new Headers(requestHeaders)
    if (data.captchaToken) {
      headers.set("x-captcha-response", data.captchaToken)
    }

    if (data.attribution) {
      try {
        await Effect.runPromise(
          stashSignupAttribution({ email: data.email, attribution: data.attribution }).pipe(
            Effect.provide(RedisCacheStoreLive(getRedisClient())),
            withTracing,
          ),
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
