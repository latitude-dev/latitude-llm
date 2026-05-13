/**
 * Path-style normalization for MCP-bound prefixes.
 *
 * Hono routes use `:param` syntax for path parameters
 * (`/projects/:projectSlug/annotations`). OpenAPI and MCP both use `{param}`
 * syntax (`/projects/{projectSlug}/annotations`). Inside the MCP registry we
 * canonicalize on the OpenAPI form so the URL dispatcher in `server.ts` only
 * has to substitute one placeholder syntax.
 *
 * Route files can therefore declare a single constant in Hono form and reuse
 * it for both the parent mount (`routes.route(annotationsPath, …)`) and
 * `defineApiEndpoint(annotationsPath)` — the latter normalizes on the way in.
 *
 * The pattern matches Hono's own parameter grammar (alphanumeric + underscore,
 * starting with a letter or underscore). It deliberately doesn't try to
 * support regex constraints (`/:id{[0-9]+}`) or wildcards (`*`) — neither has
 * a sensible MCP-tool input representation. Inputs in the OpenAPI form pass
 * through unchanged.
 */
const PARAM_PATTERN = /:([A-Za-z_][A-Za-z0-9_]*)/g

/** Converts `:param` segments to `{param}`. Idempotent on already-OpenAPI-form paths. */
export const honoPathToOpenApi = (path: string): string => path.replace(PARAM_PATTERN, "{$1}")
