import { cn, DropdownMenu, DropdownMenuTrigger, LatitudeLogo, useHashColor } from "@repo/ui"
import { extractLeadingEmoji } from "@repo/utils"
import { eq } from "@tanstack/react-db"
import { createFileRoute, Link, Outlet, redirect, useRouter, useRouterState } from "@tanstack/react-router"
import { ChevronsUpDown, Moon, Sun } from "lucide-react"
import { useState } from "react"
import { useOrganizationsCollection } from "../domains/organizations/organizations.collection.ts"
import { useProjectsCollection } from "../domains/projects/projects.collection.ts"
import { getSession } from "../domains/sessions/session.functions.ts"
import { authClient } from "../lib/auth-client.ts"

export const Route = createFileRoute("/_authenticated")({
  ssr: "data-only",
  beforeLoad: async () => {
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

function UserAvatar({ name }: { name: string }) {
  const trimmed = name.trim()
  const initials =
    trimmed.length === 0
      ? "?"
      : trimmed
          .split(/\s+/)
          .map((part) => part[0])
          .filter(Boolean)
          .slice(0, 2)
          .join("")
          .toUpperCase() || trimmed.slice(0, 2).toUpperCase()

  const { style, className } = useHashColor(name)

  return (
    <div className={cn("w-6 h-6 rounded-full flex items-center justify-center", className)} style={style}>
      <span className="text-xs font-medium leading-none">{initials}</span>
    </div>
  )
}

function ProjectBreadcrumb({ projectSlug }: { projectSlug: string }) {
  const { data: project } = useProjectsCollection(
    (projects) => projects.where(({ project }) => eq(project.slug, projectSlug)).findOne(),
    [projectSlug],
  )

  const { data: allProjects } = useProjectsCollection()
  const hasMultipleProjects = (allProjects?.length ?? 0) > 1

  if (!project) return null

  const [emoji, title] = extractLeadingEmoji(project.name)

  return (
    <>
      <span className="text-muted-foreground text-sm select-none">/</span>
      {hasMultipleProjects ? (
        <DropdownMenu
          side="bottom"
          align="start"
          options={
            allProjects?.map((p) => ({
              label: p.name,
              onClick: () => {
                window.location.href = `/projects/${p.slug}`
              },
            })) ?? []
          }
          trigger={() => (
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex items-center gap-1 px-2 py-1 rounded hover:bg-muted transition-colors cursor-pointer"
              >
                {emoji && <span className="text-sm">{emoji}</span>}
                <span className="text-sm font-medium text-muted-foreground">{title}</span>
                <ChevronsUpDown className="h-4 w-4 text-muted-foreground" />
              </button>
            </DropdownMenuTrigger>
          )}
        />
      ) : (
        <span className="text-sm font-medium text-muted-foreground px-2 py-1">
          {emoji && `${emoji} `}
          {title}
        </span>
      )}
    </>
  )
}

function ThemeToggle() {
  const [isDark, setIsDark] = useState(() =>
    typeof document !== "undefined" ? document.documentElement.classList.contains("dark") : false,
  )

  const toggle = () => {
    const next = !isDark
    document.documentElement.classList.toggle("dark", next)
    document.documentElement.style.colorScheme = next ? "dark" : "light"
    setIsDark(next)
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className="cursor-pointer text-muted-foreground hover:text-foreground transition-colors"
    >
      {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  )
}

function NavHeader() {
  const { user, organizationId } = Route.useRouteContext()
  const { data: allOrgs } = useOrganizationsCollection()
  const org = allOrgs?.find((o) => o.id === organizationId)
  const hasMultipleOrgs = (allOrgs?.length ?? 0) > 1
  const router = useRouter()
  const routerState = useRouterState()
  const pathname = routerState.location.pathname
  const projectMatch = pathname.match(/\/projects\/([^/]+)/)
  const currentProjectSlug = projectMatch?.[1] ?? null

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
        {currentProjectSlug && <ProjectBreadcrumb projectSlug={currentProjectSlug} />}
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
                void authClient.signOut().then(() => {
                  void router.navigate({ to: "/login" })
                })
              },
            },
          ]}
          trigger={() => (
            <DropdownMenuTrigger asChild>
              <button type="button" className="cursor-pointer">
                <UserAvatar name={user.name?.trim() ? user.name : user.email} />
              </button>
            </DropdownMenuTrigger>
          )}
        />
      </div>
    </header>
  )
}

function AuthenticatedLayout() {
  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <NavHeader />
      <main className="w-full flex-grow min-h-0 h-full relative overflow-y-auto">
        <Outlet />
      </main>
    </div>
  )
}
