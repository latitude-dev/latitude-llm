import { signupAttributionInputSchema, stashSignupAttribution } from "@domain/marketing"
import { InvitationRepository } from "@domain/organizations"
import { ForbiddenError } from "@domain/shared"
import { isSsoEnforcedForEmailUseCase } from "@domain/sso"
import { RedisCacheStoreLive } from "@platform/cache-redis"
import { InvitationRepositoryLive, SsoProviderRepositoryLive, withPostgres } from "@platform/db-postgres"
import { parseEnvOptional } from "@platform/env"
import { withTracing } from "@repo/observability"
import { createServerFn } from "@tanstack/react-start"
import { getRequestHeaders } from "@tanstack/react-start/server"
import { Effect } from "effect"
import z from "zod"
import { getAdminPostgresClient, getBetterAuth, getRedisClient } from "../../server/clients.ts"
import { assertTurnstileCaptchaVerified } from "./verify-turnstile-captcha.ts"

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
    // SSO enforcement: domains with a verified + enforced SSO provider must
    // sign in through their IdP. The login page redirects those emails to
    // `signIn.sso` before ever calling this fn — this server-side check stops
    // direct calls from bypassing it. Pre-auth lookup → admin client.
    const ssoEnforced = await Effect.runPromise(
      isSsoEnforcedForEmailUseCase({ email: data.email }).pipe(
        withPostgres(SsoProviderRepositoryLive, getAdminPostgresClient()),
        withTracing,
      ),
    )
    if (ssoEnforced) {
      throw new ForbiddenError({ message: "Your organization requires SSO sign-in" })
    }

    const captchaSecretKey = Effect.runSync(parseEnvOptional("LAT_TURNSTILE_SECRET_KEY", "string"))
    await assertTurnstileCaptchaVerified({
      captchaToken: data.captchaToken,
      secretKey: captchaSecretKey,
    })

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
      headers: await getRequestHeaders(),
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
