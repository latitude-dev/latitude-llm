import { createFileRoute } from "@tanstack/react-router"

/**
 * Permanent redirect from the legacy OG endpoint to the new
 * `/wrapped/$id/og/png`. Kept so social-card unfurls of already-shared
 * `/cc-wrapped/<id>` URLs still resolve.
 */
export const Route = createFileRoute("/cc-wrapped/$id/og/png")({
  server: {
    handlers: {
      GET: ({ params }: { params: { id: string } }) =>
        new Response(null, {
          status: 301,
          headers: { Location: `/wrapped/${params.id}/og/png` },
        }),
    },
  },
})
