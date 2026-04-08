import {
  Avatar,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRoot,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Icon,
  LatitudeLogo,
  Text,
} from "@repo/ui"
import { createFileRoute, Link, Outlet, redirect, useRouter } from "@tanstack/react-router"
import { ChevronsUpDown, Moon, Plus, Sun } from "lucide-react"
import { useState } from "react"
import { useOrganizationsCollection } from "../domains/organizations/organizations.collection.ts"
import { getSession } from "../domains/sessions/session.functions.ts"
import { authClient } from "../lib/auth-client.ts"
import { resetPostHog } from "../lib/posthog/posthog-client.ts"
import { PostHogIdentity } from "../lib/posthog/posthog-provider.tsx"
import { useThemePreference } from "../lib/theme.ts"
import { BreadcrumbTrail } from "./_authenticated/-components/breadcrumb-trail.tsx"
import { CreateOrganizationModal } from "./_authenticated/-components/create-organization-modal.tsx"
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
  const router = useRouter()
  const [createOrgOpen, setCreateOrgOpen] = useState(false)

  if (!org) return null

  const handleOrgSwitch = async (newOrgId: string) => {
    if (newOrgId === organizationId) return
    await authClient.organization.setActive({
      organizationId: newOrgId,
    })
    window.location.href = "/"
  }

  return (
    <>
      <CreateOrganizationModal open={createOrgOpen} onOpenChange={setCreateOrgOpen} />
      <header className="w-full bg-background border-b border-border h-12 flex items-center px-4 shrink-0">
        <div className="flex items-center gap-2 flex-1">
          <Link to="/">
            <LatitudeLogo className="h-5 w-5" />
          </Link>
          <span className="text-muted-foreground text-sm select-none">/</span>
          <DropdownMenuRoot>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex min-w-0 max-w-[min(260px,42vw)] cursor-pointer items-center gap-1.5 rounded px-2 py-1 transition-colors hover:bg-muted"
              >
                <Text.H5M className="min-w-0 truncate">{org.name}</Text.H5M>
                <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" side="bottom" className="flex w-52 flex-col gap-1">
              {(allOrgs ?? []).map((o) => (
                <DropdownMenuItem
                  key={o.id}
                  className={o.id === organizationId ? "bg-muted" : undefined}
                  onSelect={() => {
                    void handleOrgSwitch(o.id)
                  }}
                >
                  <span className="flex min-w-0 items-center gap-1.5">
                    <Text.H5 className="truncate">{o.name}</Text.H5>
                  </span>
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator className="my-0" />
              <DropdownMenuItem className="gap-2" onSelect={() => setCreateOrgOpen(true)}>
                <Plus className="h-4 w-4 shrink-0 text-muted-foreground" />
                <Text.H5>New organization</Text.H5>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenuRoot>
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
              <button type="button" className="cursor-pointer">
                <Avatar
                  name={user.name?.trim() ? user.name : user.email}
                  size="sm"
                  imageSrc={user.image ?? undefined}
                />
              </button>
            )}
          />
        </div>
      </header>
    </>
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
