import { Button, Icon, LatitudeLogo, Text } from "@repo/ui"
import { createFileRoute, Link, notFound, Outlet, useRouter } from "@tanstack/react-router"
import { ShieldAlertIcon } from "lucide-react"
import { getSession } from "../../domains/sessions/session.functions.ts"
import { authClient } from "../../lib/auth-client.ts"
import { resetPostHog } from "../../lib/posthog/posthog-client.ts"

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
    const session = await assertAdminSession()
    return { user: session.user }
  },
  component: BackofficeLayout,
})

function BackofficeLayout() {
  const user = Route.useLoaderData({ select: (data) => data.user })
  const router = useRouter()

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <header className="w-full bg-destructive text-destructive-foreground h-12 flex items-center px-4 shrink-0 gap-3">
        <Link to="/backoffice">
          <div className="flex items-center gap-2">
            <LatitudeLogo className="h-5 w-5" />
            <Text.H5 weight="semibold" color="white">
              Backoffice
            </Text.H5>
          </div>
        </Link>
        <div className="flex items-center gap-1 ml-2">
          <Icon icon={ShieldAlertIcon} size="xs" color="white" />
          <Text.H6 color="white">Platform staff only</Text.H6>
        </div>
        <div className="flex-1" />
        <Text.H6 color="white">{user.email}</Text.H6>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            void authClient.signOut().then(async () => {
              await resetPostHog()
              void router.navigate({ to: "/login" })
            })
          }}
        >
          Log out
        </Button>
      </header>
      <main className="w-full grow min-h-0 h-full relative overflow-y-auto">
        <Outlet />
      </main>
    </div>
  )
}
