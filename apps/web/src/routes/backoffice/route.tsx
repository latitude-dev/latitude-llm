import { Button, Icon, LatitudeLogo, Text } from "@repo/ui"
import { createFileRoute, Link, notFound, Outlet, useRouter } from "@tanstack/react-router"
import { ArrowLeft, Building2, Search, ShieldAlertIcon } from "lucide-react"
import { AppSidebar, NavItem } from "../../layouts/AppSidebar/index.tsx"
import { usePathname } from "../../lib/hooks/use-router-selectors.ts"
import { requireAdminSession } from "../../server/admin-auth.ts"

// Delegate the role check to `requireAdminSession()` so the UI and RPC
// surfaces share a single source of truth for the admin gate — including
// the DB-fresh fetch that sidesteps Better Auth's 5-minute session cookie
// cache (see the comment on `requireAdminSession`). The route-local
// wrapper converts the domain `NotFoundError` into TanStack Router's
// `notFound()` so the response is indistinguishable from any unknown
// URL — no redirect, no 403, no Location header leak.
//
// Match on the Effect-native `_tag` (survives the RPC JSON boundary)
// rather than `instanceof NotFoundError` or a blanket catch. Only
// `NotFoundError` — the tagged error `requireAdminSession()` throws
// when the caller is not an admin or is unauthenticated — is
// collapsed into a 404. Anything else (DB outage, connectivity,
// serialization bug from the Better Auth fresh-session fetch) must
// bubble to the router error boundary instead of being silently
// masked as a 404. Same discipline as the `$userId.tsx` loader.
const guardBackofficeRoute = async () => {
  try {
    await requireAdminSession()
  } catch (error) {
    const tag = (error as { _tag?: string } | null | undefined)?._tag
    if (tag === "NotFoundError") {
      throw notFound()
    }
    throw error
  }
}

export const Route = createFileRoute("/backoffice")({
  ssr: "data-only",
  // Gate runs in `beforeLoad` so it fires BEFORE any child route's loader.
  // Without this, `backoffice/index.tsx`'s `throw redirect({ to: "/backoffice/search" })`
  // would execute for unauthenticated probes and leak the subpath in the 307
  // Location header.
  beforeLoad: guardBackofficeRoute,
  loader: async () => {
    await guardBackofficeRoute()
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
          {/*
           * The "Platform staff only" wayfinding cue stays — it's useful so
           * staff know they're in the admin surface — but it's rendered in
           * a muted neutral colour, not destructive. Across the backoffice
           * red is reserved exclusively for the impersonation banner /
           * avatar overlay, where it signals an actively-hazardous session
           * state. Bleeding red into static chrome dilutes that signal.
           */}
          <Icon icon={ShieldAlertIcon} size="xs" color="foregroundMuted" />
          <Text.H6 color="foregroundMuted">Platform staff only</Text.H6>
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
            <>
              <NavItem
                icon={Search}
                label="Search"
                to="/backoffice/search"
                active={pathname === "/backoffice/search" || pathname.startsWith("/backoffice/search/")}
                collapsed={collapsed}
              />
              <NavItem
                icon={Building2}
                label="Organizations"
                to="/backoffice/organizations"
                // Match only the listing route, not the per-org detail page —
                // detail pages are reached from search / recent chips and
                // shouldn't highlight the listing entry as if the user is
                // browsing it.
                active={pathname === "/backoffice/organizations" || pathname === "/backoffice/organizations/"}
                collapsed={collapsed}
              />
            </>
          )}
        </AppSidebar>
        <main className="flex-1 min-w-0 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
