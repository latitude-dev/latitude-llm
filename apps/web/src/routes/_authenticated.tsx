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
import { extractLeadingEmoji } from "@repo/utils"
import { createFileRoute, Link, Outlet, redirect, useNavigate, useParams, useRouter } from "@tanstack/react-router"
import { BookOpen, ChevronsUpDown, Moon, Plus, Settings as SettingsIcon, Sun } from "lucide-react"
import { type ReactNode, useCallback, useMemo, useState } from "react"
import { useOrganizationsCollection } from "../domains/organizations/organizations.collection.ts"
import { useProjectsCollection } from "../domains/projects/projects.collection.ts"
import type { ProjectRecord } from "../domains/projects/projects.functions.ts"
import { getSession } from "../domains/sessions/session.functions.ts"
import { authClient } from "../lib/auth-client.ts"
import { resetPostHog } from "../lib/posthog/posthog-client.ts"
import { PostHogIdentity } from "../lib/posthog/posthog-provider.tsx"
import { useThemePreference } from "../lib/theme.ts"
import { BreadcrumbTrail } from "./_authenticated/-components/breadcrumb-trail.tsx"
import { CreateOrganizationModal } from "./_authenticated/-components/create-organization-modal.tsx"
import { CreateProjectModal } from "./_authenticated/-components/create-project-modal.tsx"
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

/** Project picker + New project. Same `modal` and trigger pattern as the org menu so Radix behaves consistently. */
function HeaderProjectsMenu({
  projects,
  projectSlug,
  onNewProject,
}: {
  projects: readonly ProjectRecord[]
  projectSlug: string | undefined
  onNewProject: () => void
}) {
  const navigate = useNavigate()

  const activeProject = useMemo(
    () => (projectSlug ? projects.find((p) => p.slug === projectSlug) : undefined),
    [projects, projectSlug],
  )

  const triggerLabel = useMemo(() => {
    if (!projectSlug) return { emoji: null as string | null, title: "Projects" as string }
    if (activeProject) {
      const [e, t] = extractLeadingEmoji(activeProject.name)
      return { emoji: e, title: t }
    }
    return { emoji: null as string | null, title: projectSlug }
  }, [projectSlug, activeProject])

  const triggerClassName =
    "flex min-w-0 max-w-[min(260px,42vw)] cursor-pointer select-none items-center gap-1.5 rounded px-2 py-1 transition-colors hover:bg-muted outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"

  return (
    <DropdownMenuRoot modal={false}>
      <DropdownMenuTrigger className={triggerClassName}>
        {triggerLabel.emoji ? <span className="shrink-0 text-sm">{triggerLabel.emoji}</span> : null}
        <Text.H5M className="min-w-0 flex-1 truncate text-left">{triggerLabel.title}</Text.H5M>
        <ChevronsUpDown className="pointer-events-none h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="bottom" className="flex w-52 flex-col gap-1">
        {projects.map((p) => {
          const [itemEmoji, itemTitle] = extractLeadingEmoji(p.name)
          return (
            <DropdownMenuItem
              key={p.id}
              className={p.slug === projectSlug ? "bg-muted" : undefined}
              onSelect={() => {
                void navigate({ to: "/projects/$projectSlug", params: { projectSlug: p.slug } })
              }}
            >
              <span className="flex min-w-0 items-center gap-1.5">
                {itemEmoji ? <span className="shrink-0 text-sm">{itemEmoji}</span> : null}
                <Text.H5 className="truncate">{itemTitle}</Text.H5>
              </span>
            </DropdownMenuItem>
          )
        })}
        <DropdownMenuSeparator className="my-0" />
        <DropdownMenuItem className="gap-2" onSelect={onNewProject}>
          <Plus className="h-4 w-4 shrink-0 text-muted-foreground" />
          <Text.H5>New project</Text.H5>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenuRoot>
  )
}

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
  const { projectSlug } = useParams({ strict: false })
  const { data: allProjects, isLoading: projectsLoading } = useProjectsCollection()
  const projectsInOrg = allProjects ?? []
  const [createOrgOpen, setCreateOrgOpen] = useState(false)
  const [createProjectOpen, setCreateProjectOpen] = useState(false)
  const openCreateProjectModal = useCallback(() => {
    setCreateProjectOpen(true)
  }, [])

  if (!org) return null

  const handleOrgSwitch = async (newOrgId: string) => {
    if (newOrgId === organizationId) return
    await authClient.organization.setActive({
      organizationId: newOrgId,
    })
    window.location.href = "/"
  }

  let projectNav: ReactNode = null
  if (!(projectsLoading && projectsInOrg.length === 0) && projectsInOrg.length > 0) {
    projectNav = (
      <HeaderProjectsMenu projects={projectsInOrg} projectSlug={projectSlug} onNewProject={openCreateProjectModal} />
    )
  }

  return (
    <>
      <CreateOrganizationModal open={createOrgOpen} onOpenChange={setCreateOrgOpen} />
      <CreateProjectModal open={createProjectOpen} onOpenChange={setCreateProjectOpen} />
      <header className="w-full bg-background border-b border-border h-12 flex items-center px-4 shrink-0">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Link to="/">
            <LatitudeLogo className="h-5 w-5" />
          </Link>
          <span className="shrink-0 text-muted-foreground text-sm select-none">/</span>
          <div className="relative z-10 flex min-w-0 shrink-0">
            <DropdownMenuRoot modal={false}>
              <DropdownMenuTrigger className="flex min-w-0 max-w-[min(260px,42vw)] cursor-pointer select-none items-center gap-1.5 rounded px-2 py-1 transition-colors hover:bg-muted outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background">
                <Text.H5M className="min-w-0 flex-1 truncate text-left">{org.name}</Text.H5M>
                <ChevronsUpDown className="pointer-events-none h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
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
          </div>
          <span className="shrink-0 text-muted-foreground text-sm select-none">/</span>
          <div className="relative z-10 flex min-w-0 shrink-0">{projectNav}</div>
          <div className="flex min-h-0 min-w-0 flex-1 items-center gap-2 overflow-x-auto">
            <BreadcrumbTrail />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" asChild>
              <a
                href="https://docs.latitude.so"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5"
              >
                <Icon icon={BookOpen} size="2xs" color="foregroundMuted" />
                Docs
              </a>
            </Button>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/settings" className="inline-flex items-center gap-1.5">
                <Icon icon={SettingsIcon} size="2xs" color="foregroundMuted" />
                Settings
              </Link>
            </Button>
          </div>
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
