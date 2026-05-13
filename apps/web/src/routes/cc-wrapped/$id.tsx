import { createFileRoute, redirect } from "@tanstack/react-router"

/**
 * Permanent redirect from the legacy `/cc-wrapped/$id` URL to the new
 * `/wrapped/$id`. Kept so links from already-sent emails and in-app
 * notifications keep working.
 */
export const Route = createFileRoute("/cc-wrapped/$id")({
  beforeLoad: ({ params }) => {
    throw redirect({ to: "/wrapped/$id", params, statusCode: 301 })
  },
})
