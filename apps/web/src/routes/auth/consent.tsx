/**
 * OAuth consent page for the Better Auth `mcp` plugin's MCP/OIDC flow.
 *
 * The plugin's authorize endpoint redirects users here with `consent_code`,
 * `client_id`, and `scope` query params (and a signed `oidc_consent_prompt`
 * cookie that BA's `oAuthConsent` reads server-side). The user picks one of
 * their organizations — that org is bound to the OAuth client for the
 * lifetime of the issued access tokens — and approves or denies.
 *
 * On approve: the server fn writes `oauth_applications.organization_id` and
 * BA returns a redirect URL back to the MCP client's `redirect_uri` with
 * `?code=…`. On deny: BA returns the same URL with `?error=access_denied`.
 * Either way the page navigates `window.location.href` to the URL so the
 * MCP client can complete the auth-code exchange.
 *
 * Auth requirement: the user must be signed in. If they're not, the loader
 * redirects to `/login` with the consent URL as the post-login `redirect`
 * search param so the flow resumes after sign-in.
 */
import { Button, Icon, LatitudeLogo, Text } from "@repo/ui"
import { createFileRoute, redirect } from "@tanstack/react-router"
import { AlertCircle, KeyRound } from "lucide-react"
import { useState } from "react"
import { z } from "zod"
import { decideOAuthConsent, getOAuthConsentRequest } from "../../domains/oauth/oauth-consent.functions.ts"
import { getSession } from "../../domains/sessions/session.functions.ts"
import { toUserMessage } from "../../lib/errors.ts"

const consentSearchSchema = z.object({
  consent_code: z.string().min(1),
  client_id: z.string().min(1),
  scope: z.string().optional(),
})

export const Route = createFileRoute("/auth/consent")({
  validateSearch: consentSearchSchema,
  loaderDeps: ({ search }) => search,
  loader: async ({ deps }) => {
    const session = await getSession().catch(() => null)
    if (!session) {
      // Bounce through /login and come back so the user has a session before
      // we ask them to bind an org. The full consent URL (including the
      // signed-cookie-backed `consent_code`) is preserved in `redirect`.
      const consentPath = `/auth/consent?consent_code=${encodeURIComponent(deps.consent_code)}&client_id=${encodeURIComponent(deps.client_id)}${
        deps.scope ? `&scope=${encodeURIComponent(deps.scope)}` : ""
      }`
      throw redirect({ to: "/login", search: { redirect: consentPath } })
    }

    const consent = await getOAuthConsentRequest({ data: { clientId: deps.client_id } })
    return { consent }
  },
  component: OAuthConsentPage,
})

function OAuthConsentPage() {
  const { consent_code, scope } = Route.useSearch()
  const { consent } = Route.useLoaderData()
  const [selectedOrgId, setSelectedOrgId] = useState<string>(consent.organizations[0]?.id ?? "")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string>()

  const requestedScopes = (scope ?? "").split(/\s+/).filter(Boolean)
  const clientName = consent.client.name ?? "An MCP client"

  const submit = async (decision: "accept" | "deny") => {
    if (isSubmitting) return
    if (decision === "accept" && !selectedOrgId) {
      setError("Please select an organization to grant access to.")
      return
    }
    setIsSubmitting(true)
    setError(undefined)
    try {
      const { redirectUrl } =
        decision === "accept"
          ? await decideOAuthConsent({
              data: {
                accept: true,
                consentCode: consent_code,
                clientId: consent.client.clientId,
                organizationId: selectedOrgId,
              },
            })
          : await decideOAuthConsent({ data: { accept: false, consentCode: consent_code } })
      // BA's redirect URL points to the MCP client's `redirect_uri` (a different
      // origin in prod), so use a full navigation, not router.navigate.
      window.location.href = redirectUrl
    } catch (err) {
      setError(toUserMessage(err))
      setIsSubmitting(false)
    }
  }

  const noOrgs = consent.organizations.length === 0

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-background">
      <div className="flex flex-col gap-y-6 max-w-md w-full">
        <div className="flex flex-col items-center justify-center gap-y-6">
          <LatitudeLogo />
          <div className="flex flex-col items-center justify-center gap-y-2">
            <Text.H3 align="center">Authorize access</Text.H3>
            <Text.H5 color="foregroundMuted" align="center">
              {clientName} wants to act on your behalf
            </Text.H5>
          </div>
        </div>

        <div className="flex flex-col gap-4 rounded-xl overflow-hidden shadow-none bg-muted/50 border border-border p-6">
          <div className="flex flex-col items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
              <Icon icon={KeyRound} className="h-6 w-6 text-primary" />
            </div>
          </div>

          {requestedScopes.length > 0 && (
            <div className="flex flex-col gap-2">
              <Text.H6 weight="medium">Permissions requested</Text.H6>
              <ul className="flex flex-col gap-1">
                {requestedScopes.map((scopeName: string) => (
                  <li key={scopeName}>
                    <Text.H6 color="foregroundMuted">• {scopeName}</Text.H6>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {noOrgs ? (
            <div className="flex flex-col gap-2">
              <Text.H6 color="destructive">
                You don't belong to any organization yet. Create one before authorizing this client.
              </Text.H6>
            </div>
          ) : (
            <fieldset className="flex flex-col gap-2">
              <Text.H6 weight="medium">Choose an organization</Text.H6>
              <Text.H6 color="foregroundMuted">
                {clientName} will be granted access to this organization. The token can't be moved later — disconnect
                and reconnect to switch organizations.
              </Text.H6>
              <div className="flex flex-col gap-2 mt-2">
                {consent.organizations.map((org: { id: string; name: string }) => (
                  <label
                    key={org.id}
                    className="flex items-center gap-3 rounded-lg border border-input bg-background px-3 py-2 cursor-pointer hover:bg-muted/50"
                  >
                    <input
                      type="radio"
                      name="organization"
                      value={org.id}
                      checked={selectedOrgId === org.id}
                      onChange={(e) => setSelectedOrgId(e.target.value)}
                      className="h-4 w-4"
                    />
                    <Text.H6 weight="medium">{org.name}</Text.H6>
                  </label>
                ))}
              </div>
            </fieldset>
          )}

          {error && (
            <div className="flex items-center gap-2 text-sm text-destructive">
              <Icon icon={AlertCircle} className="h-4 w-4" />
              <Text.H6 color="destructive">{error}</Text.H6>
            </div>
          )}

          <div className="flex flex-col gap-2">
            <Button
              size="full"
              type="button"
              disabled={isSubmitting || noOrgs}
              onClick={() => submit("accept")}
              className="relative w-full inline-flex items-center justify-center rounded-lg text-sm font-semibold leading-5 text-white bg-primary hover:bg-primary/90 disabled:opacity-50 disabled:pointer-events-none h-9 px-3 py-2 shadow-[inset_0px_0px_0px_1px_rgba(0,0,0,0.4)] active:translate-y-px active:shadow-none transition-all"
            >
              {isSubmitting ? "Authorizing…" : "Authorize"}
            </Button>
            <Button
              variant="ghost"
              type="button"
              disabled={isSubmitting}
              onClick={() => submit("deny")}
              className="relative w-full inline-flex items-center justify-center rounded-lg text-sm font-medium leading-5 text-foreground bg-background border border-input hover:bg-muted disabled:opacity-50 disabled:pointer-events-none h-9 px-3 py-2 transition-colors"
            >
              Deny
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
