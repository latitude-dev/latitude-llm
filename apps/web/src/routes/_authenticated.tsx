import { Avatar, Button, DropdownMenu, DropdownMenuTrigger, Icon, LatitudeLogo } from "@repo/ui"
import { createFileRoute, Link, Outlet, redirect, useRouter } from "@tanstack/react-router"
import { ChevronsUpDown, Moon, Sun } from "lucide-react"
import { useOrganizationsCollection } from "../domains/organizations/organizations.collection.ts"
import { getSession } from "../domains/sessions/session.functions.ts"
import { authClient } from "../lib/auth-client.ts"
import { resetPostHog } from "../lib/posthog/posthog-client.ts"
import { PostHogIdentity } from "../lib/posthog/posthog-provider.tsx"
import { useThemePreference } from "../lib/theme.ts"
import { BreadcrumbTrail } from "./_authenticated/-components/breadcrumb-trail.tsx"
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

    return {
      user: session.user,
      organizationId,
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
  const { data: allOrgs } = useOrganizationsCollection()
  const org = allOrgs?.find((o) => o.id === organizationId)
  const hasMultipleOrgs = (allOrgs?.length ?? 0) > 1
  const router = useRouter()

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
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="flex items-center gap-1 px-2 py-1 rounded hover:bg-muted transition-colors cursor-pointer"
                >
                  <span className="text-sm font-medium text-foreground">{org.name}</span>
                  <ChevronsUpDown className="h-4 w-4 text-muted-foreground" />
                </button>
              </DropdownMenuTrigger>
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
            <DropdownMenuTrigger asChild>
              <button type="button" className="cursor-pointer">
                <Avatar
                  name={user.name?.trim() ? user.name : user.email}
                  size="sm"
                  imageSrc={user.image ?? undefined}
                />
              </button>
            </DropdownMenuTrigger>
          )}
        />
      </div>
    </header>
  )
}

function AuthenticatedLayout() {
  const user = Route.useLoaderData({ select: (data) => data.user })
  const organizationId = Route.useLoaderData({ select: (data) => data.organizationId })
  const { data: allOrgs } = useOrganizationsCollection()
  const org = allOrgs?.find((o) => o.id === organizationId)

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <PostHogIdentity
        key={user.id}
        userId={user.id}
        userEmail={user.email}
        userName={user.name}
        organizationId={organizationId}
        organizationName={org?.name}
      />
      <NavHeader />
      <main className="w-full grow min-h-0 h-full relative overflow-y-auto">
        <Outlet />
      </main>
    </div>
  )
}
