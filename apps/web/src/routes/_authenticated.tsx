import { Avatar, Button, DropdownMenu, Icon, LatitudeLogo } from "@repo/ui"
import { createFileRoute, Link, Outlet, redirect, useRouter, useRouterState } from "@tanstack/react-router"
import { ChevronsUpDown, HatGlassesIcon, Moon, ShieldAlertIcon, Sun } from "lucide-react"
import { useOrganizationsCollection } from "../domains/organizations/organizations.collection.ts"
import { getSession } from "../domains/sessions/session.functions.ts"
import { authClient } from "../lib/auth-client.ts"
import { resetPostHog } from "../lib/posthog/posthog-client.ts"
import { PostHogIdentity } from "../lib/posthog/posthog-provider.tsx"
import { useThemePreference } from "../lib/theme.ts"
import { BreadcrumbTrail } from "./_authenticated/-components/breadcrumb-trail.tsx"
import { ImpersonationBanner } from "./_authenticated/-components/impersonation-banner.tsx"
import { useRootThemePreference } from "./-root-route-data.ts"

export const Route = createFileRoute("/_authenticated")({
  ssr: "data-only",
  staleTime: Infinity,
  remountDeps: () => "authenticated-layout",
  // Keep rendered layout data in `loader` instead of `beforeLoad`.
  // `beforeLoad` is best for middleware-style redirects/preconditions, while
  // `loader` participates in TanStack Router's cache (`staleTime`) and can be
  // consumed via `useLoaderData({ select })` without refetching on same-route
  // search-param navigations.
  loader: async () => {
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

    return {
      user: session.user,
      organizationId,
      impersonatedBy,
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

function NavHeader() {
  const user = Route.useLoaderData({ select: (data) => data.user })
  const organizationId = Route.useLoaderData({ select: (data) => data.organizationId })
  const impersonatedBy = Route.useLoaderData({ select: (data) => data.impersonatedBy })
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
        <ThemeToggle />
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
  const organizationId = Route.useLoaderData({ select: (data) => data.organizationId })
  const impersonatedBy = Route.useLoaderData({ select: (data) => data.impersonatedBy })
  const { data: allOrgs } = useOrganizationsCollection()
  const org = allOrgs?.find((o) => o.id === organizationId)
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const isProjectOnboarding = /\/projects\/[^/]+\/onboarding\/?$/.test(pathname.replace(/\/$/, "") || "/")

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <PostHogIdentity
        key={user.id}
        userId={user.id}
        userEmail={user.email}
        userName={user.name}
        organizationId={organizationId}
        organizationName={org?.name}
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
  )
}
