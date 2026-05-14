/**
 * Public OAuth/MCP discovery surface for this resource server.
 *
 * RFC 9728 (OAuth Protected Resource Metadata) lets a protected resource
 * advertise the authorization server(s) trusted to issue tokens for it. Our
 * authorization server is the web app's Better Auth `mcp` plugin, which lives
 * on a different origin (typical: `app.latitude.so` vs `api.latitude.so`).
 * RFC 9728 explicitly allows the AS to live on a different origin than the
 * protected resource — the AS just has to be listed here so MCP clients know
 * where to start the OAuth dance.
 *
 * Public route (no auth, RING 1). The handler reads URLs at request time —
 * not at module load — so test envs that change `LAT_WEB_URL` / `LAT_API_URL`
 * between runs see the current values.
 */
import { createRoute, type OpenAPIHono, z } from "@hono/zod-openapi"
import { parseEnv } from "@platform/env"
import { Effect } from "effect"
import type { AppEnv } from "../types.ts"

const ProtectedResourceMetadataSchema = z
  .object({
    /** This resource server's identifier — the API origin. */
    resource: z.string(),
    /** Authorization server issuer URLs that may issue tokens for `resource`. */
    authorization_servers: z.array(z.string()),
  })
  .openapi("OAuthProtectedResourceMetadata")

const oauthProtectedResourceRoute = createRoute({
  method: "get",
  path: "/.well-known/oauth-protected-resource",
  operationId: "wellKnown.oauthProtectedResource",
  tags: ["Well-known"],
  summary: "OAuth protected resource metadata",
  description:
    "RFC 9728 metadata document advertising the authorization server(s) trusted to issue access tokens for this API.",
  responses: {
    200: {
      content: { "application/json": { schema: ProtectedResourceMetadataSchema } },
      description: "Protected resource metadata",
    },
  },
})

const buildMetadata = () =>
  Effect.gen(function* () {
    const apiUrl = yield* parseEnv("LAT_API_URL", "string")
    const webUrl = yield* parseEnv("LAT_WEB_URL", "string")
    return {
      resource: apiUrl,
      // Bare web origin, not `${webUrl}/api/auth` — Better Auth's OIDC plugin
      // emits the AS metadata with `issuer = baseURL` (i.e. `${webUrl}`,
      // without the `/api/auth` path; cf. `better-auth/dist/plugins/oidc-
      // provider/index.mjs:53`). Strict clients (Zed) enforce RFC 8414 §3.3
      // and reject when the issuer doesn't match the AS URL we advertise.
      // The web app's root-level `/.well-known/oauth-authorization-server`
      // redirect funnels probes to BA's actual `<webUrl>/api/auth/...`
      // location, so the discovery still resolves end-to-end.
      authorization_servers: [webUrl],
    }
  })

export const registerWellKnownRoutes = ({ app }: { app: OpenAPIHono<AppEnv> }) => {
  app.openapi(oauthProtectedResourceRoute, async (c) => {
    const metadata = await Effect.runPromise(buildMetadata())
    return c.json(metadata, 200)
  })

  // RFC 9728 §3 path-suffixed form: when a resource lives at a non-root path
  // (e.g. `/v1/mcp`), the metadata location is
  // `<origin>/.well-known/oauth-protected-resource<resource-path>`. Cursor
  // probes the unscoped form; Zed probes the path-suffixed form first.
  // Serving the same payload at every suffix satisfies both — the metadata
  // describes the entire `apiUrl` resource server regardless of which sub-
  // path the client probed from.
  app.get("/.well-known/oauth-protected-resource/*", async (c) => {
    const metadata = await Effect.runPromise(buildMetadata())
    return c.json(metadata, 200)
  })
}
