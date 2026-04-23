import { Button, Icon, LatitudeLogo, Text } from "@repo/ui"
import { createFileRoute, Link, notFound, Outlet, useRouter } from "@tanstack/react-router"
import { ArrowLeft, Search, ShieldAlertIcon } from "lucide-react"
import { AppSidebar, NavItem } from "../../layouts/AppSidebar/index.tsx"
import { getSession } from "../../domains/sessions/session.functions.ts"
import { usePathname } from "../../lib/hooks/use-router-selectors.ts"

// Extract to a named helper so both `beforeLoad` (the parent gate) and the
// loader use identical logic — and so the intent is explicit.
const assertAdminSession = async () => {
  const session = await getSession()
  const role = (session?.user as { role?: string } | undefined)?.role
  if (!session || role !== "admin") {
    // 404, not redirect: the existence of the backoffice surface must not
    // leak through error types, redirects, or Location headers.
    throw notFound()
  }
  return session
}

export const Route = createFileRoute("/backoffice")({
  ssr: "data-only",
  // Gate runs in `beforeLoad` so it fires BEFORE any child route's loader.
  // Without this, `backoffice/index.tsx`'s `throw redirect({ to: "/backoffice/search" })`
  // would execute for unauthenticated probes and leak the subpath in the 307
  // Location header.
  beforeLoad: async () => {
    await assertAdminSession()
  },
  loader: async () => {
    await assertAdminSession()
    return null
  },
  component: BackofficeLayout,
})

function BackofficeLayout() {
  const pathname = usePathname()
  const router = useRouter()

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <header className="w-full bg-background border-b border-border h-12 flex items-center px-4 shrink-0 gap-3">
        <Link to="/backoffice" className="flex items-center gap-2">
          <LatitudeLogo className="h-5 w-5" />
          <Text.H5 weight="semibold">Backoffice</Text.H5>
        </Link>
        <div className="flex items-center gap-1 ml-2">
          <Icon icon={ShieldAlertIcon} size="xs" color="destructive" />
          <Text.H6 color="destructive">Platform staff only</Text.H6>
        </div>
        <div className="flex-1" />
        <Button variant="outline" size="sm" onClick={() => void router.navigate({ to: "/" })}>
          <Icon icon={ArrowLeft} size="sm" />
          Back to app
        </Button>
      </header>
      <div className="flex min-h-0 flex-1">
        <AppSidebar title="Backoffice">
          {({ collapsed }) => (
            <NavItem
              icon={Search}
              label="Search"
              to="/backoffice/search"
              active={pathname === "/backoffice/search" || pathname.startsWith("/backoffice/search/")}
              collapsed={collapsed}
            />
          )}
        </AppSidebar>
        <main className="flex-1 min-w-0 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
