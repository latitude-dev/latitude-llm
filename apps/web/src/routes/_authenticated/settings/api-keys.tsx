import { createFileRoute, redirect } from "@tanstack/react-router"

/**
 * Legacy URL — the page moved to `/settings/keys` when we introduced the
 * combined API Keys + OAuth Keys surface. Kept as a redirect-only route
 * so old bookmarks and any in-product links don't 404. Safe to remove
 * once analytics show no traffic on this path.
 */
export const Route = createFileRoute("/_authenticated/settings/api-keys")({
  beforeLoad: () => {
    throw redirect({ to: "/settings/keys", replace: true })
  },
})
