import { Button, cn, Icon, LatitudeLogo, Text, useHashColor } from "@repo/ui"
import { createFileRoute, redirect, useRouter } from "@tanstack/react-router"
import { AlertCircle, ArrowRight } from "lucide-react"
import { useEffect, useState } from "react"
import { setActiveOrganization } from "../../domains/auth/auth.functions.ts"
import { createOrganization, listOrganizations } from "../../domains/organizations/organizations.functions.ts"
import { getSession } from "../../domains/sessions/session.functions.ts"
import { updateUser } from "../../domains/users/user.functions.ts"
import { gtmHeadScripts, TRACKING_PARAM_KEYS } from "../../lib/analytics/gtm.ts"
import { GtmNoScript, SignupCompleteWatcher } from "../../lib/analytics/signup-complete-watcher.tsx"
import { authClient } from "../../lib/auth-client.ts"
import { toUserMessage } from "../../lib/errors.ts"

function OrgAvatar({ name }: { name: string }) {
  const { style, className } = useHashColor(name)
  return (
    <div
      className={cn("flex items-center justify-center w-9 h-9 rounded-lg text-sm font-semibold", className)}
      style={style}
    >
      {name.charAt(0).toUpperCase()}
    </div>
  )
}

interface Organization {
  id: string
  name: string
  slug?: string
}

type WelcomeSearch = Partial<Record<(typeof TRACKING_PARAM_KEYS)[number] | "signup", string>>

export const Route = createFileRoute("/welcome/")({
  component: WelcomePage,
  validateSearch: (raw: Record<string, unknown>): WelcomeSearch => {
    const out: WelcomeSearch = {}
    if (typeof raw.signup === "string") out.signup = raw.signup
    for (const key of TRACKING_PARAM_KEYS) {
      const value = raw[key]
      if (typeof value === "string") out[key] = value
    }
    return out
  },
  head: () => ({ scripts: gtmHeadScripts() }),
  loader: async ({ location }) => {
    const session = await getSession()
    if (!session) {
      throw redirect({ to: "/login" })
    }

    const orgs = await listOrganizations()
    const search = location.search as WelcomeSearch
    if (orgs && orgs.length === 1 && !search.signup) {
      const org = orgs[0]
      // NOTE: for some reason we cannot use better auth client here so we have
      // this serverfn indirection
      await setActiveOrganization({ data: { organizationId: org.id, organizationSlug: org.slug } })
      throw redirect({ to: "/" })
    }

    return { organizations: (orgs ?? []) as Organization[] }
  },
})

function WelcomePage() {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string>()
  const { organizations } = Route.useLoaderData()
  const router = useRouter()

  // When the user was invited (single pre-existing org), auto-activate it and
  // move on. This runs client-side so SignupCompleteWatcher has a chance to
  // push the GTM conversion event from /welcome before we navigate.
  useEffect(() => {
    if (organizations.length !== 1) return
    const org = organizations[0]
    void (async () => {
      await authClient.organization.setActive({ organizationId: org.id })
      await router.navigate({ to: "/" })
    })()
  }, [organizations, router])

  const handleSelectOrg = async (orgId: string) => {
    setIsSubmitting(true)
    try {
      await authClient.organization.setActive({ organizationId: orgId })
      await router.navigate({ to: "/" })
    } catch (err) {
      setError(toUserMessage(err))
      setIsSubmitting(false)
    }
  }

  const handleCreateOrg = async (e: React.SubmitEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (isSubmitting) return

    const formData = new FormData(e.currentTarget)
    const userName = String(formData.get("name") ?? "")
    const organizationName = String(formData.get("organizationName") ?? "")

    if (!userName.trim()) {
      setError("Please enter your name")
      return
    }

    if (!organizationName.trim()) {
      setError("Please enter an organization name")
      return
    }

    setIsSubmitting(true)
    setError(undefined)

    try {
      await updateUser({ data: { name: userName } })
      const organization = await createOrganization({ data: { name: organizationName } })
      await setActiveOrganization({
        data: { organizationId: organization.id, organizationSlug: organization.slug },
      })
      // Full navigation ensures project onboarding reads the freshly-updated auth session.
      window.location.href = `/projects/${organization.defaultProject.slug}/onboarding`
    } catch (err) {
      setError(toUserMessage(err))
      setIsSubmitting(false)
    }
  }

  if (organizations.length === 1) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-background">
        <GtmNoScript />
        <SignupCompleteWatcher />
        <div className="flex flex-col items-center justify-center gap-y-6">
          <LatitudeLogo />
          <Text.H5 color="foregroundMuted">Setting up your workspace…</Text.H5>
        </div>
      </div>
    )
  }

  if (organizations.length > 1) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-background">
        <GtmNoScript />
        <SignupCompleteWatcher />
        <div className="flex flex-col gap-y-6 max-w-[22rem] w-full">
          <div className="flex flex-col items-center justify-center gap-y-6">
            <LatitudeLogo />
            <div className="flex flex-col items-center justify-center gap-y-2">
              <Text.H3 align="center">Select your workspace</Text.H3>
              <Text.H5 color="foregroundMuted" align="center">
                Choose which workspace to use
              </Text.H5>
            </div>
          </div>

          <div className="flex flex-col rounded-xl overflow-hidden shadow-none border border-border">
            {organizations.map((org: Organization, index: number) => {
              return (
                <button
                  key={org.id}
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => handleSelectOrg(org.id)}
                  className={`flex items-center gap-3 p-3 bg-background hover:bg-muted transition-colors disabled:opacity-50 cursor-pointer ${
                    index > 0 ? "border-t border-border" : ""
                  }`}
                >
                  <OrgAvatar name={org.name} />
                  <Text.H5 weight="medium" className="flex-1 text-left">
                    {org.name}
                  </Text.H5>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </button>
              )
            })}

            {error && (
              <div className="flex items-center gap-2 text-sm text-destructive px-3 pt-2">
                <Icon icon={AlertCircle} className="h-4 w-4" />
                <Text.H6 color="destructive">{error}</Text.H6>
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-background">
      <GtmNoScript />
      <SignupCompleteWatcher />
      <div className="flex flex-col gap-y-6 max-w-[22rem] w-full">
        <div className="flex flex-col items-center justify-center gap-y-6">
          <LatitudeLogo />
          <div className="flex flex-col items-center justify-center gap-y-2">
            <Text.H3 align="center">Complete your profile</Text.H3>
            <Text.H5 color="foregroundMuted" align="center">
              Tell us a bit about yourself
            </Text.H5>
          </div>
        </div>

        <div className="flex flex-col gap-4 rounded-xl overflow-hidden shadow-none bg-muted/50 border border-border p-6">
          <form onSubmit={handleCreateOrg} className="flex flex-col gap-4">
            <label htmlFor="name" className="flex flex-col gap-2">
              <Text.H6 weight="medium">Your name</Text.H6>
              <input
                id="name"
                name="name"
                type="text"
                placeholder="Ex.: John Doe"
                required
                autoComplete="name"
                data-autofocus="true"
                className="flex w-full border border-input bg-background rounded-lg text-sm leading-5 px-3 py-2 h-9 placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              />
            </label>

            <label htmlFor="organizationName" className="flex flex-col gap-2">
              <Text.H6 weight="medium">Organization name</Text.H6>
              <input
                id="organizationName"
                name="organizationName"
                type="text"
                placeholder="Ex.: Acme Inc."
                required
                className="flex w-full border border-input bg-background rounded-lg text-sm leading-5 px-3 py-2 h-9 placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              />
            </label>

            {error && (
              <div className="flex items-center gap-2 text-sm text-destructive">
                <Icon icon={AlertCircle} className="h-4 w-4" />
                <Text.H6 color="destructive">{error}</Text.H6>
              </div>
            )}

            <Button
              size="full"
              type="submit"
              disabled={isSubmitting}
              className="relative w-full inline-flex items-center justify-center rounded-lg text-sm font-semibold leading-5 text-white bg-primary hover:bg-primary/90 disabled:opacity-50 disabled:pointer-events-none h-9 px-3 py-2 shadow-[inset_0px_0px_0px_1px_rgba(0,0,0,0.4)] active:translate-y-[1px] active:shadow-none transition-all"
            >
              {isSubmitting ? "Saving…" : "Continue"}
            </Button>
          </form>
        </div>
      </div>
    </div>
  )
}
