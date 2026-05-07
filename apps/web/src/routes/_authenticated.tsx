import { PRO_PLAN_CONFIG } from "@domain/billing"
import { show as showIntercom } from "@intercom/messenger-js-sdk"
import { Avatar, Button, cn, DropdownMenu, Icon, LatitudeLogo, Text, Tooltip, useToast } from "@repo/ui"
import { useQuery } from "@tanstack/react-query"
import { createFileRoute, Link, Outlet, redirect, useRouter, useRouterState } from "@tanstack/react-router"
import { ChevronsUpDown, HatGlassesIcon, LifeBuoy, Moon, ShieldAlertIcon, Sun } from "lucide-react"
import { useState } from "react"
import { createBillingCheckoutSession, getBillingOverview } from "../domains/billing/billing.functions.ts"
import { useOrganizationsCollection } from "../domains/organizations/organizations.collection.ts"
import { createProject, listProjects } from "../domains/projects/projects.functions.ts"
import { getSession } from "../domains/sessions/session.functions.ts"
import { getSupportUserIdentity } from "../domains/support/support.functions.ts"
import { authClient } from "../lib/auth-client.ts"
import { toUserMessage } from "../lib/errors.ts"
import { IntercomProvider } from "../lib/intercom/intercom-provider.tsx"
import { isLatitudeStaffEmail, resetPostHog } from "../lib/posthog/posthog-client.ts"
import { PostHogIdentity } from "../lib/posthog/posthog-provider.tsx"
import { useThemePreference } from "../lib/theme.ts"
import { BreadcrumbTrail } from "./_authenticated/-components/breadcrumb-trail.tsx"
import { ImpersonationBanner } from "./_authenticated/-components/impersonation-banner.tsx"
import { isProjectOnboardingPathname } from "./_authenticated/-lib/is-project-onboarding-pathname.ts"
import { useRootThemePreference } from "./-root-route-data.ts"

const projectOnboardingRouteId = "/_authenticated/projects/$projectSlug/onboarding" as const
const numberFormatter = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 })
const BILLING_COUNTER_RADIUS = 8
const BILLING_COUNTER_CIRCUMFERENCE = 2 * Math.PI * BILLING_COUNTER_RADIUS
const FREE_PLAN_UPGRADE_USAGE_THRESHOLD = 0.8

export const Route = createFileRoute("/_authenticated")({
  ssr: "data-only",
  staleTime: Infinity,
  remountDeps: () => "authenticated-layout",
  // Session + org bootstrap. New organizations are provisioned during creation,
  // but this fallback still repairs older orgs that somehow have no projects.
  loader: async ({ location }) => {
    const session = await getSession()
    if (!session) {
      throw redirect({ to: "/login" })
    }

    const sessionData = session.session as Record<string, unknown>
    const organizationId =
      typeof sessionData.activeOrganizationId === "string" ? sessionData.activeOrganizationId : null
    if (!organizationId) {
      throw redirect({ to: "/welcome" })
    }

    // Set by the Better Auth `admin` plugin when an admin is impersonating
    // another user. The impersonation banner reads this to announce the
    // active impersonation on every authenticated page.
    const impersonatedBy = typeof sessionData.impersonatedBy === "string" ? sessionData.impersonatedBy : null

    const projects = await listProjects()
    if (projects.length === 0 && !isProjectOnboardingPathname(location.pathname)) {
      const created = await createProject({ data: { name: "My project" } })
      throw redirect({
        to: "/projects/$projectSlug/onboarding",
        params: { projectSlug: created.slug },
      })
    }

    const supportIdentity = await getSupportUserIdentity()

    return {
      user: session.user,
      organizationId,
      impersonatedBy,
      supportIdentity,
    }
  },
  component: AuthenticatedLayout,
})

function ThemeToggle() {
  const initialTheme = useRootThemePreference()
  const { theme, setTheme } = useThemePreference(initialTheme)
  const nextTheme = theme === "dark" ? "light" : "dark"

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label={`Switch to ${nextTheme} mode`}
      title={`Switch to ${nextTheme} mode`}
      aria-pressed={theme === "dark"}
      className="h-8 w-8 group-hover:text-foreground"
      onClick={() => setTheme(nextTheme)}
    >
      <Icon icon={theme === "dark" ? Sun : Moon} size="sm" />
    </Button>
  )
}

function BillingCreditCounter({ organizationId }: { readonly organizationId: string }) {
  const { toast } = useToast()
  const [isUpgradePending, setIsUpgradePending] = useState(false)
  const { data: overview } = useQuery({
    queryKey: ["billing", "overview", organizationId],
    queryFn: () => getBillingOverview(),
    staleTime: 30_000,
  })

  if (!overview) return null

  const includedCredits = overview.includedCredits
  const totalUsedCredits = overview.consumedCredits + overview.overageCredits
  const hasIncludedCredits = includedCredits !== null && includedCredits > 0
  const progress = hasIncludedCredits ? Math.min(totalUsedCredits / includedCredits, 1) : 1
  const isOverage = overview.overageCredits > 0
  const strokeOffset = BILLING_COUNTER_CIRCUMFERENCE * (1 - progress)
  const consumedLabel = numberFormatter.format(totalUsedCredits)
  const includedLabel = includedCredits === null ? "custom" : numberFormatter.format(includedCredits)
  const usageLabel =
    includedCredits === null ? `${consumedLabel} credits` : `${consumedLabel} / ${includedLabel} credits`
  const tooltip = isOverage
    ? `${numberFormatter.format(totalUsedCredits)} credits used: ${numberFormatter.format(overview.consumedCredits)} included credits plus ${numberFormatter.format(overview.overageCredits)} metered overage credits. Usage can exceed the included limit because this plan allows overage billing.`
    : `${numberFormatter.format(overview.consumedCredits)} of ${includedLabel} credits used this period`
  const showUpgradeCta =
    overview.planSlug === "free" &&
    hasIncludedCredits &&
    totalUsedCredits / includedCredits >= FREE_PLAN_UPGRADE_USAGE_THRESHOLD

  const openUpgrade = async () => {
    setIsUpgradePending(true)
    try {
      const data = await createBillingCheckoutSession({
        data: { plan: PRO_PLAN_CONFIG.slug, returnUrl: "/settings/billing" },
      })

      if (data.url) {
        window.location.href = data.url
      }
    } catch (error) {
      toast({ variant: "destructive", description: toUserMessage(error) })
    } finally {
      setIsUpgradePending(false)
    }
  }

  return (
    <div className="flex items-center gap-2">
      {showUpgradeCta ? (
        <Button size="sm" isLoading={isUpgradePending} onClick={() => void openUpgrade()}>
          Upgrade now
        </Button>
      ) : null}
      <Tooltip
        asChild
        trigger={
          <Link
            to="/settings/billing"
            aria-label={tooltip}
            className="flex items-center gap-2 rounded-md px-2 py-1 text-sm text-foreground transition-colors hover:bg-muted"
          >
            <span className="relative flex h-5 w-5 items-center justify-center" aria-hidden="true">
              <svg aria-hidden="true" className="h-5 w-5 -rotate-90" viewBox="0 0 20 20">
                <circle
                  cx="10"
                  cy="10"
                  r={BILLING_COUNTER_RADIUS}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className="text-muted"
                />
                <circle
                  cx="10"
                  cy="10"
                  r={BILLING_COUNTER_RADIUS}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeDasharray={BILLING_COUNTER_CIRCUMFERENCE}
                  strokeDashoffset={strokeOffset}
                  className={cn("transition-colors", {
                    "text-primary": !isOverage,
                    "text-destructive": isOverage,
                  })}
                />
              </svg>
            </span>
            <div className="flex items-baseline gap-1">
              <Text.H6 weight="medium" color={isOverage ? "destructive" : "foreground"}>
                {usageLabel}
              </Text.H6>
            </div>
          </Link>
        }
      >
        {tooltip}
      </Tooltip>
    </div>
  )
}

function NavHeader() {
  const user = Route.useLoaderData({ select: (data) => data.user })
  const organizationId = Route.useLoaderData({
    select: (data) => data.organizationId,
  })
  const impersonatedBy = Route.useLoaderData({
    select: (data) => data.impersonatedBy,
  })
  const supportEnabled = Route.useLoaderData({
    select: (data) => data.supportIdentity !== null,
  })
  const { data: allOrgs } = useOrganizationsCollection()
  const org = allOrgs?.find((o) => o.id === organizationId)
  const hasMultipleOrgs = (allOrgs?.length ?? 0) > 1
  const router = useRouter()
  const isAdmin = (user as { role?: string }).role === "admin"

  if (!org) return null

  const handleOrgSwitch = async (newOrgId: string) => {
    if (newOrgId === organizationId) return
    await authClient.organization.setActive({
      organizationId: newOrgId,
    })
    window.location.href = "/"
  }

  return (
    <header className="w-full bg-background border-b border-border h-12 flex items-center px-4 shrink-0">
      <div className="flex items-center gap-2 flex-1">
        <Link to="/">
          <LatitudeLogo className="h-5 w-5" />
        </Link>
        <span className="text-muted-foreground text-sm select-none">/</span>
        {hasMultipleOrgs ? (
          <DropdownMenu
            side="bottom"
            align="start"
            options={
              allOrgs?.map((o) => ({
                label: o.name,
                onClick: () => void handleOrgSwitch(o.id),
              })) ?? []
            }
            trigger={() => (
              <button
                type="button"
                className="flex items-center gap-1 px-2 py-1 rounded hover:bg-muted transition-colors cursor-pointer"
              >
                <span className="text-sm font-medium text-foreground">{org.name}</span>
                <ChevronsUpDown className="h-4 w-4 text-muted-foreground" />
              </button>
            )}
          />
        ) : (
          <span className="text-sm font-medium text-foreground px-2 py-1">{org.name}</span>
        )}
        <BreadcrumbTrail />
      </div>
      <div className="flex items-center gap-4">
        <BillingCreditCounter organizationId={organizationId} />
        <ThemeToggle />
        {supportEnabled && (
          <button
            type="button"
            onClick={() => showIntercom()}
            className="flex items-center gap-1.5 hover:text-muted-foreground transition-colors cursor-pointer"
          >
            <Icon icon={LifeBuoy} size="sm" />
            <Text.H5>Help</Text.H5>
          </button>
        )}
        <a
          href="https://docs.latitude.so"
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-foreground hover:text-muted-foreground transition-colors"
        >
          Docs
        </a>
        <Link to="/settings" className="text-sm text-foreground hover:text-muted-foreground transition-colors">
          Settings
        </Link>
        <DropdownMenu
          side="bottom"
          align="end"
          options={[
            ...(isAdmin
              ? [
                  {
                    label: "Backoffice",
                    iconProps: { icon: ShieldAlertIcon, size: "sm" as const },
                    onClick: () => {
                      void router.navigate({ to: "/backoffice" })
                    },
                  },
                ]
              : []),
            {
              label: "Log out",
              type: "destructive",
              onClick: () => {
                void authClient.signOut().then(async () => {
                  // Reset PostHog AFTER sign-out so events captured during the
                  // logout flow stay attributed. The next user starts anonymous
                  // until PostHogIdentity remounts with a new key.
                  await resetPostHog()
                  void router.navigate({ to: "/login" })
                })
              },
            },
          ]}
          trigger={() => (
            <button type="button" className="cursor-pointer">
              <span className="relative inline-flex">
                <Avatar
                  name={user.name?.trim() ? user.name : user.email}
                  size="sm"
                  imageSrc={user.image ?? undefined}
                />
                {impersonatedBy && (
                  // Small hat glasses icon overlaid on the user's avatar whenever the session is an impersonation.
                  <span
                    aria-hidden="true"
                    className="absolute -top-1/2 -right-1/2 transform -translate-x-1/2 translate-y-1 items-center justify-center"
                  >
                    <Icon icon={HatGlassesIcon} size="md" />
                  </span>
                )}
              </span>
            </button>
          )}
        />
      </div>
    </header>
  )
}

function AuthenticatedLayout() {
  const user = Route.useLoaderData({ select: (data) => data.user })
  const organizationId = Route.useLoaderData({
    select: (data) => data.organizationId,
  })
  const impersonatedBy = Route.useLoaderData({
    select: (data) => data.impersonatedBy,
  })
  const supportIdentity = Route.useLoaderData({
    select: (data) => data.supportIdentity,
  })
  const isProjectOnboarding = useRouterState({
    // `match.id` is unique per match instance (`routeId` + path + loader deps hash);
    // `routeId` is the stable file-route id from `createFileRoute(...)`.
    select: (s) => s.matches.some((m) => m.routeId === projectOnboardingRouteId),
  })
  const { data: allOrgs } = useOrganizationsCollection()
  const org = allOrgs?.find((o) => o.id === organizationId)

  return (
    <IntercomProvider identity={supportIdentity} floatingButton="none">
      <div className="flex h-screen flex-col overflow-hidden">
        <PostHogIdentity
          key={user.id}
          userId={user.id}
          userEmail={user.email}
          userName={user.name}
          organizationId={organizationId}
          organizationName={org?.name}
          excludeFromAnalytics={isLatitudeStaffEmail(user.email) || impersonatedBy != null}
        />
        {impersonatedBy && <ImpersonationBanner impersonatedUserEmail={user.email} />}
        {isProjectOnboarding ? null : <NavHeader />}
        <main
          className={
            isProjectOnboarding
              ? "relative flex min-h-0 w-full flex-1 flex-col overflow-hidden"
              : "relative h-full min-h-0 w-full grow overflow-y-auto"
          }
        >
          <Outlet />
        </main>
      </div>
    </IntercomProvider>
  )
}
