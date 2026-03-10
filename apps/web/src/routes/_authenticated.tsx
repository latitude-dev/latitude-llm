import { DropdownMenu, DropdownMenuTrigger } from "@repo/ui"
import { LatitudeLogo } from "@repo/ui"
import { extractLeadingEmoji } from "@repo/utils"
import { eq } from "@tanstack/react-db"
import { Link, Outlet, createFileRoute, redirect, useRouter, useRouterState } from "@tanstack/react-router"
import { ChevronsUpDown, Moon, Sun } from "lucide-react"
import { useEffect, useState } from "react"
import { countUserOrganizations, getOrganization } from "../domains/organizations/organizations.functions.ts"
import { useProjectsCollection } from "../domains/projects/projects.collection.ts"
import { getSession } from "../domains/sessions/session.functions.ts"
import { authClient } from "../lib/auth-client.ts"

export const Route = createFileRoute("/_authenticated")({
  beforeLoad: async () => {
    const session = await getSession()

    if (!session) {
      throw redirect({ to: "/login" })
    }

    const sessionData = session.session as Record<string, unknown>
    const organizationId =
      typeof sessionData.activeOrganizationId === "string" ? sessionData.activeOrganizationId : null

    const [organization, orgCount] = await Promise.all([getOrganization(), countUserOrganizations()])

    return {
      user: session.user,
      organizationId,
      organizationName: organization.name,
      hasMultipleOrgs: orgCount > 1,
    }
  },
  component: AuthenticatedLayout,
})

function UserAvatar({ name }: { name: string }) {
  const initials = name
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase()

  return (
    <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center">
      <span className="text-xs font-medium text-primary-foreground leading-none">{initials}</span>
    </div>
  )
}

function ProjectBreadcrumb({ projectId }: { projectId: string }) {
  const { data: project } = useProjectsCollection(
    (projects) => projects.where(({ project }) => eq(project.id, projectId)).findOne(),
    [projectId],
  )

  const { data: allProjects } = useProjectsCollection()
  const hasMultipleProjects = (allProjects?.length ?? 0) > 1

  if (!project) return null

  const [emoji, title] = extractLeadingEmoji(project.name)

  return (
    <>
      <span className="text-muted-foreground text-sm select-none">/</span>
      {hasMultipleProjects ? (
        <button type="button" className="flex items-center gap-1 px-2 py-1 rounded hover:bg-muted transition-colors">
          {emoji && <span className="text-sm">{emoji}</span>}
          <span className="text-sm font-medium text-muted-foreground">{title}</span>
          <ChevronsUpDown className="h-4 w-4 text-muted-foreground" />
        </button>
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
  const [isDark, setIsDark] = useState(false)

  useEffect(() => {
    setIsDark(document.documentElement.classList.contains("dark"))
  }, [])

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
  const { user, organizationName, hasMultipleOrgs } = Route.useRouteContext()
  const router = useRouter()
  const routerState = useRouterState()
  const pathname = routerState.location.pathname

  const projectMatch = pathname.match(/\/projects\/([^/]+)/)
  const currentProjectId = projectMatch?.[1] ?? null

  return (
    <header className="w-full bg-background border-b border-border h-12 flex items-center px-4 shrink-0">
      <div className="flex items-center gap-2 flex-1">
        <Link to="/">
          <LatitudeLogo className="h-5 w-5" />
        </Link>
        <span className="text-muted-foreground text-sm select-none">/</span>
        {hasMultipleOrgs ? (
          <button type="button" className="flex items-center gap-1 px-2 py-1 rounded hover:bg-muted transition-colors">
            <span className="text-sm font-medium text-foreground">{organizationName}</span>
            <ChevronsUpDown className="h-4 w-4 text-muted-foreground" />
          </button>
        ) : (
          <span className="text-sm font-medium text-foreground px-2 py-1">{organizationName}</span>
        )}
        {currentProjectId && <ProjectBreadcrumb projectId={currentProjectId} />}
      </div>
      <div className="flex items-center gap-4">
        {import.meta.env.DEV && <ThemeToggle />}
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
                <UserAvatar name={user.name ?? user.email} />
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
