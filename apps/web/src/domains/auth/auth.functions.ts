import { InvitationRepository } from "@domain/organizations"
import { InvitationRepositoryLive, withPostgres } from "@platform/db-postgres"
import { withTracing } from "@repo/observability"
import { createServerFn } from "@tanstack/react-start"
import { getRequestHeaders } from "@tanstack/react-start/server"
import { Effect } from "effect"
import z from "zod"
import { getAdminPostgresClient, getBetterAuth } from "../../server/clients.ts"

const sendMagicLinkInputSchema = z.object({
  email: z.email(),
  callbackURL: z.string().optional(),
  newUserCallbackURL: z.string().optional(),
  captchaToken: z.string().optional(),
})

export const sendMagicLink = createServerFn({ method: "POST" })
  .inputValidator(sendMagicLinkInputSchema)
  .handler(async ({ data }) => {
    const requestHeaders = await getRequestHeaders()
    const headers = new Headers(requestHeaders)
    if (data.captchaToken) {
      headers.set("x-captcha-response", data.captchaToken)
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
