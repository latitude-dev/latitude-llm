import { createFileRoute } from "@tanstack/react-router"
import { getBetterAuth } from "../../../../server/clients.ts"

/**
 * Specific route for `GET /api/auth/mcp/authorize`. Takes precedence over the
 * catch-all `routes/api/auth/$.ts` because TanStack file-based routing prefers
 * exact matches over splat routes.
 *
 * Why we don't just delegate to BA's handler: BA's `mcp` plugin authorize
 * endpoint bypasses the consent page entirely unless the request carries
 * `prompt=consent` in the query string (verified at
 * `better-auth@1.6.9/dist/plugins/mcp/authorize.mjs:103`). Real OAuth clients
 * (Claude Code, Cursor, …) don't pass that — and without it our
 * `/auth/consent` page never renders, the org-binding step never runs, and
 * tokens get issued with `oauth_applications.organization_id IS NULL`, which
 * the API auth middleware then rejects. The OAuth round-trip would silently
 * break.
 *
 * Force `prompt=consent` server-side so the consent page always shows. The
 * downside (re-prompting on every authorize) is actually the desired behavior
 * here: re-authorizing is also how a user switches the org an OAuth client is
 * bound to.
 */
export const Route = createFileRoute("/api/auth/mcp/authorize")({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        const url = new URL(request.url)
        if (url.searchParams.get("prompt") !== "consent") {
          url.searchParams.set("prompt", "consent")
          return getBetterAuth().handler(new Request(url.toString(), request))
        }
        return getBetterAuth().handler(request)
      },
    },
  },
})
