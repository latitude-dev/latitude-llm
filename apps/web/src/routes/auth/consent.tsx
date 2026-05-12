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
import { Button, cn, initialsFromDisplayName, LatitudeLogo, Text, useHashColor, useToast } from "@repo/ui"
import { createFileRoute, redirect } from "@tanstack/react-router"
import { ArrowRight } from "lucide-react"
import { useState } from "react"
import { z } from "zod"
import { decideOAuthConsent, getOAuthConsentRequest } from "../../domains/oauth/oauth-consent.functions.ts"
import { getSession } from "../../domains/sessions/session.functions.ts"
import { toUserMessage } from "../../lib/errors.ts"

type ResultPhase = { kind: "authorized"; organizationName: string } | { kind: "denied" }

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

    const consent = await getOAuthConsentRequest({
      data: { clientId: deps.client_id, consentCode: deps.consent_code },
    })
    return { consent }
  },
  component: OAuthConsentPage,
})

// Mirrors the org selector used at `/welcome` (avatar, name, arrow).
// Same `useHashColor` for the avatar tile so the visual is consistent across
// the two surfaces a user picks an org on.
function OrgAvatar({ name }: { name: string }) {
  const { style, className } = useHashColor(name)
  return (
    <div
      className={cn("flex items-center justify-center w-9 h-9 rounded-lg text-sm font-semibold", className)}
      style={style}
    >
      {initialsFromDisplayName(name)}
    </div>
  )
}

function OAuthConsentPage() {
  const { consent_code } = Route.useSearch()
  const { consent } = Route.useLoaderData()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [result, setResult] = useState<ResultPhase | null>(null)
  const { toast } = useToast()

  const clientName = consent.client.name ?? "An OAuth client"
  const noOrgs = consent.organizations.length === 0

  const authorizeForOrg = async (organizationId: string) => {
    if (isSubmitting) return
    setIsSubmitting(true)
    try {
      const { redirectUrl } = await decideOAuthConsent({
        data: {
          accept: true,
          consentCode: consent_code,
          clientId: consent.client.clientId,
          organizationId,
        },
      })
      const organizationName =
        consent.organizations.find((org: { id: string; name: string }) => org.id === organizationId)?.name ??
        "your organization"
      setResult({ kind: "authorized", organizationName })
      window.location.replace(redirectUrl)
    } catch (err) {
      toast({ variant: "destructive", description: toUserMessage(err) })
      setIsSubmitting(false)
    }
  }

  const deny = async () => {
    if (isSubmitting) return
    setIsSubmitting(true)
    try {
      const { redirectUrl } = await decideOAuthConsent({
        data: { accept: false, consentCode: consent_code },
      })
      setResult({ kind: "denied" })
      window.location.replace(redirectUrl)
    } catch (err) {
      toast({ variant: "destructive", description: toUserMessage(err) })
      setIsSubmitting(false)
    }
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-background">
      <div className="flex flex-col gap-y-6 max-w-md w-full">
        <div className="flex flex-col items-center justify-center gap-y-6">
          <LatitudeLogo />
          <div className="flex flex-col items-center justify-center gap-y-2">
            {result === null ? (
              <>
                <Text.H3 align="center">Authorize access</Text.H3>
                <Text.H5 color="foregroundMuted" align="center">
                  {clientName} wants to act on your behalf
                </Text.H5>
              </>
            ) : result.kind === "authorized" ? (
              <>
                <Text.H3 align="center">Access granted</Text.H3>
                <Text.H5 color="foregroundMuted" align="center">
                  {clientName} has been granted access
                </Text.H5>
              </>
            ) : (
              <>
                <Text.H3 align="center">Access denied</Text.H3>
                <Text.H5 color="foregroundMuted" align="center">
                  {clientName} has been denied access
                </Text.H5>
              </>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-4 rounded-xl overflow-hidden shadow-none bg-muted/50 border border-border p-6">
          <Text.H5 color="foregroundMuted">
            {result === null ? (
              <>
                <Text.H5 weight="medium">{clientName}</Text.H5> will act on your behalf and have full access to the
                organization you choose below. You can revoke this access at any time from your organization's{" "}
                <Text.H5 weight="medium">OAuth Keys</Text.H5> settings.
              </>
            ) : result.kind === "authorized" ? (
              <>
                <Text.H5 weight="medium">{clientName}</Text.H5> has been authorized to access{" "}
                <Text.H5 weight="medium">{result.organizationName}</Text.H5>. You can close this page and return to{" "}
                <Text.H5 weight="medium">{clientName}</Text.H5>.
              </>
            ) : (
              <>
                <Text.H5 weight="medium">{clientName}</Text.H5> has been denied access. You can close this page and
                return to <Text.H5 weight="medium">{clientName}</Text.H5>.
              </>
            )}
          </Text.H5>

          {result === null && (
            <>
              {noOrgs ? (
                <Text.H5 color="destructive">
                  You don't belong to any organization yet. Create one before authorizing this client.
                </Text.H5>
              ) : (
                <div className="flex flex-col gap-2">
                  <Text.H5 weight="medium">Choose an organization</Text.H5>
                  <div className="flex flex-col rounded-xl overflow-hidden shadow-none border border-border">
                    {consent.organizations.map((org: { id: string; name: string }, index: number) => (
                      <button
                        key={org.id}
                        type="button"
                        disabled={isSubmitting}
                        onClick={() => authorizeForOrg(org.id)}
                        className={cn(
                          "flex items-center gap-3 p-3 bg-background hover:bg-muted transition-colors disabled:opacity-50 cursor-pointer",
                          index > 0 && "border-t border-border",
                        )}
                      >
                        <OrgAvatar name={org.name} />
                        <Text.H5 weight="medium" className="flex-1 text-left">
                          {org.name}
                        </Text.H5>
                        <Text.H5 color="foregroundMuted">Authorize</Text.H5>
                        <ArrowRight className="h-4 w-4 text-muted-foreground" />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <Button
                variant="ghost"
                type="button"
                disabled={isSubmitting}
                onClick={deny}
                className="relative w-full inline-flex items-center justify-center rounded-lg text-sm font-medium leading-5 text-foreground bg-background border border-input hover:bg-muted disabled:opacity-50 disabled:pointer-events-none h-9 px-3 py-2 transition-colors"
              >
                Deny
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
