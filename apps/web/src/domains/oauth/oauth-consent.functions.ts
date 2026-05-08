/**
 * Server-fns backing the OAuth consent page (`apps/web/src/routes/auth/consent.tsx`).
 *
 * The flow:
 * 1. The MCP plugin's authorize endpoint redirects the signed-in user to
 *    `/auth/consent?consent_code=…&client_id=…&scope=…` (and sets a signed
 *    `oidc_consent_prompt` cookie that BA's `oAuthConsent` endpoint reads).
 * 2. The page calls {@link getOAuthConsentRequest} to fetch context the UI
 *    needs (the requesting client's name + icon + the requested scopes
 *    plus the user's organizations to pick from).
 * 3. The user picks an org and presses Approve or Deny.
 * 4. The page calls {@link decideOAuthConsent}. On approve, the server fn
 *    binds the picked org to the OAuth application (writes
 *    `oauth_applications.organization_id`) and then asks BA to finish the
 *    authorize flow with `accept: true`. On deny, it just calls BA with
 *    `accept: false` — no binding.
 * 5. BA returns a redirect URL (back to the MCP client's `redirect_uri`
 *    with either `?code=…` on accept or `?error=access_denied` on deny);
 *    the page navigates the browser there.
 *
 * Security:
 * - The user must be signed in (server fns enforce via `requireUserSession`).
 * - The org-binding write only succeeds if the user is a member of the
 *   chosen org (verified through `MembershipRepository.isMember`).
 * - Drizzle on the admin connection is used because the row we're writing
 *   is RLS-scoped on the very `organization_id` we're about to set —
 *   without admin we'd hit a chicken-and-egg before the row qualifies.
 */
import { MembershipRepository } from "@domain/organizations"
import { OrganizationId, UnauthorizedError } from "@domain/shared"
import { eq, MembershipRepositoryLive, withPostgres } from "@platform/db-postgres"
import { oauthApplications, verifications } from "@platform/db-postgres/schema/better-auth"
import { withTracing } from "@repo/observability"
import { createServerFn } from "@tanstack/react-start"
import { getRequestHeaders } from "@tanstack/react-start/server"
import { Effect } from "effect"
import { z } from "zod"
import { requireUserSession } from "../../server/auth.ts"
import { getAdminPostgresClient, getBetterAuth } from "../../server/clients.ts"
import { listOrganizations } from "../organizations/organizations.functions.ts"

const consentDecisionSchema = z
  .discriminatedUnion("accept", [
    z.object({
      accept: z.literal(true),
      consentCode: z.string().min(1),
      clientId: z.string().min(1),
      organizationId: z.string().min(1),
    }),
    z.object({
      accept: z.literal(false),
      consentCode: z.string().min(1),
    }),
  ])
  .meta({ description: "OAuth consent decision posted by the consent page." })

const consentRequestSchema = z.object({
  clientId: z.string().min(1),
  consentCode: z.string().min(1),
})

interface OAuthConsentRedirect {
  /** URL the browser should navigate to after BA finishes the authorize step. */
  readonly redirectUrl: string
}

interface OAuthConsentRequestData {
  readonly client: {
    readonly clientId: string
    readonly name: string | null
    readonly icon: string | null
  }
  readonly organizations: ReadonlyArray<{ readonly id: string; readonly name: string }>
}

/**
 * Narrow shape of the BA `mcp` plugin's `oAuthConsent` endpoint contract.
 *
 * The plugin is installed via `extraPlugins` in `getBetterAuth()`, and
 * `createBetterAuth` erases extra-plugin endpoints from the inferred
 * `auth.api` type — the call below has to go through an explicit cast.
 *
 * Return shape: BA returns `{ redirectURI }` from both branches — accept
 * (`better-auth@1.6.9/dist/plugins/oidc-provider/index.mjs:358`) and deny
 * (`oidc-provider/index.mjs:331`). Different from BA's `{ redirect, url }`
 * pair, which is for browser-fetch responses on the authorize endpoint.
 */
interface OAuthConsentApi {
  readonly oAuthConsent: (params: {
    body: { accept: boolean; consent_code?: string }
    headers: Headers
  }) => Promise<{ redirectURI: string }>
}

/**
 * Look up display data for the consent page: the requesting OAuth client (so
 * the page can show "<client name> wants to access your account") and the
 * caller's organizations (so they can pick one to bind the token to).
 *
 * Also validates the `consent_code` is still alive in BA's `verifications`
 * table — once the user accepts or denies, BA either rewrites or deletes the
 * row, so visiting the page again via browser-back leaves the URL pointing at
 * a code BA can no longer resolve. Surfacing the staleness here means we
 * never render an apparently-functional consent UI that would 401 the moment
 * the user clicks anything.
 */
export const getOAuthConsentRequest = createServerFn({ method: "GET" })
  .inputValidator(consentRequestSchema)
  .handler(async ({ data }): Promise<OAuthConsentRequestData> => {
    await requireUserSession()
    const adminClient = getAdminPostgresClient()

    const [verification] = await adminClient.db
      .select({ identifier: verifications.identifier, expiresAt: verifications.expiresAt })
      .from(verifications)
      .where(eq(verifications.identifier, data.consentCode))
      .limit(1)
    if (!verification || verification.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedError({
        message:
          "This authorization request has already been used or has expired. Start a new sign-in from your OAuth client.",
      })
    }

    const [client] = await adminClient.db
      .select({ clientId: oauthApplications.clientId, name: oauthApplications.name, icon: oauthApplications.icon })
      .from(oauthApplications)
      .where(eq(oauthApplications.clientId, data.clientId))
      .limit(1)
    if (!client?.clientId) {
      throw new UnauthorizedError({ message: "Unknown OAuth client" })
    }

    const orgs = await listOrganizations()
    return {
      client: { clientId: client.clientId, name: client.name, icon: client.icon },
      organizations: orgs.map((o) => ({ id: o.id, name: o.name })),
    }
  })

/**
 * Finalise an OAuth consent decision. On `accept: true`, binds the picked
 * organization to the OAuth client and tells BA to issue the auth code.
 * On `accept: false`, tells BA to fail the flow with `access_denied`.
 *
 * Returns the redirect URL BA produced; the caller (browser) navigates there
 * via `window.location.href`.
 */
export const decideOAuthConsent = createServerFn({ method: "POST" })
  .inputValidator(consentDecisionSchema)
  .handler(async ({ data }): Promise<OAuthConsentRedirect> => {
    const userId = await requireUserSession()
    const headers = await getRequestHeaders()

    if (data.accept) {
      const organizationId = OrganizationId(data.organizationId)
      const adminClient = getAdminPostgresClient()

      const isMember = await Effect.runPromise(
        Effect.gen(function* () {
          const repo = yield* MembershipRepository
          return yield* repo.isMember(organizationId, userId)
        }).pipe(withPostgres(MembershipRepositoryLive, adminClient), withTracing),
      )
      if (!isMember) {
        throw new UnauthorizedError({ message: "Not a member of the chosen organization" })
      }

      // Bind the OAuth application to the picked org. The row's RLS is scoped
      // on `organization_id`, so we use the admin connection — no `set
      // organization_id` precondition exists for the row we're about to claim.
      await adminClient.db
        .update(oauthApplications)
        .set({ organizationId, updatedAt: new Date() })
        .where(eq(oauthApplications.clientId, data.clientId))
    }

    // See {@link OAuthConsentApi} for why we cast — extra-plugin endpoints
    // aren't visible on `auth.api` at the type level.
    const api = getBetterAuth().api as unknown as OAuthConsentApi

    let result: { redirectURI: string }
    try {
      result = await api.oAuthConsent({
        body: { accept: data.accept, consent_code: data.consentCode },
        headers: new Headers(headers),
      })
    } catch {
      // BA throws `APIError("UNAUTHORIZED", { error: "invalid_request" })` when
      // the consent_code points at a verification that's already been used or
      // deleted (the deny path deletes; accept rotates to a new identifier).
      // Re-raise as a typed app error so the UI can render a clear message
      // instead of letting TanStack Start's runtime turn the throw into an
      // anonymous 500.
      throw new UnauthorizedError({
        message:
          "This authorization request has already been used or has expired. Start a new sign-in from your OAuth client.",
      })
    }

    if (typeof result?.redirectURI === "string" && result.redirectURI.length > 0) {
      return { redirectUrl: result.redirectURI }
    }
    throw new UnauthorizedError({ message: "OAuth consent did not return a redirect URL" })
  })
