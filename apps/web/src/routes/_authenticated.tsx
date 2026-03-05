import { TabSelector } from "@repo/ui"
import { Outlet, createFileRoute, redirect } from "@tanstack/react-router"
import { Link, useRouterState } from "@tanstack/react-router"
import { getSession } from "../domains/sessions/session.functions.ts"

const NAV_LINKS = [
  {
    label: "Projects",
    value: "/",
    route: "/",
  },
  {
    label: "Settings",
    value: "/settings",
    route: "/settings",
  },
]

export const Route = createFileRoute("/_authenticated")({
  beforeLoad: async () => {
    const session = await getSession()

    if (!session) {
      throw redirect({ to: "/login" })
    }

    const sessionData = session.session as Record<string, unknown>
    const organizationId =
      typeof sessionData.activeOrganizationId === "string" ? sessionData.activeOrganizationId : null

    return {
      user: session.user,
      organizationId,
    }
  },
  component: AuthenticatedLayout,
})

function AppTabs() {
  const routerState = useRouterState()
  const pathname = routerState.location.pathname

  const selected = pathname.startsWith("/settings") ? "/settings" : "/"

  return (
    <div className="flex flex-row">
      <TabSelector
        showSelectedOnSubroutes
        options={NAV_LINKS}
        selected={selected}
        linkWrapper={({ children, href, className }) => (
          <Link to={href} className={className}>
            {children}
          </Link>
        )}
      />
    </div>
  )
}

function AuthenticatedLayout() {
  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <main className="w-full flex-grow min-h-0 h-full relative overflow-y-auto">
        <Outlet />
      </main>
    </div>
  )
}

export { AppTabs }
