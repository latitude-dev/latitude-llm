import { createFileRoute, notFound, Outlet, redirect } from "@tanstack/react-router"
import { getSandbox } from "../../../domains/sandbox/sandbox.functions.ts"
import { parseServerError } from "../../../lib/errors.ts"

/**
 * Parent route for the `/sandbox/:sandboxOrgId/*` subtree.
 *
 * `beforeLoad` is the single structural gate for everything under
 * `/sandbox/:sandboxOrgId` — it fires before any child loader, so a
 * descendant route (settings, traces, …) literally cannot be reached
 * without it. The resolved sandbox is returned into the route context so
 * child routes read it via `useRouteContext` without re-fetching, and
 * `getSandbox` only hits the DB once per page load.
 *
 * Failure mapping is the same shape used in the backoffice layout:
 * `NotFoundError` collapses to `notFound()` (no fingerprint of whether
 * the id is unknown vs. forbidden), `UnauthorizedError` redirects to
 * `/login`. Anything else bubbles to the router error boundary.
 */
export const Route = createFileRoute("/sandbox/$sandboxOrgId")({
  ssr: "data-only",
  beforeLoad: async ({ params }) => {
    try {
      const sandbox = await getSandbox({ data: { sandboxOrgId: params.sandboxOrgId } })
      return { sandbox }
    } catch (error) {
      const { _tag } = parseServerError(error)
      if (_tag === "NotFoundError") throw notFound()
      if (_tag === "UnauthorizedError") throw redirect({ to: "/login" })
      throw error
    }
  },
  component: SandboxLayout,
})

function SandboxLayout() {
  return <Outlet />
}
