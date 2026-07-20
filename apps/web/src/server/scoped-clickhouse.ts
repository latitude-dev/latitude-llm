import { withClickHouse } from "@platform/db-clickhouse"
import type { Layer } from "effect"
import type { ScopedOrgId } from "./resolve-org-scope.ts"

/**
 * The org-scoped ClickHouse entry point for web server functions. Identical to
 * {@link withClickHouse} except its org id is a {@link ScopedOrgId} — a brand only
 * {@link resolveOrgScope} can mint. ClickHouse has no RLS backstop, so the query's
 * org param is the *only* tenant boundary; requiring the brand here makes it a
 * compile error to run a scoped read against a raw session/user-supplied org
 * instead of the resolver's authorized one.
 *
 * Every multi-tenant CH read in the web app must go through this, not raw
 * `withClickHouse` (enforced by lint on the read domains). Non-web callers
 * (api / workers / workflows) keep using `withClickHouse` directly — they have
 * their own org context and no request scope to resolve.
 */
export const withScopedClickHouse = <A, E, R>(
  layer: Layer.Layer<A, E, R>,
  client: Parameters<typeof withClickHouse>[1],
  organizationId: ScopedOrgId,
) => withClickHouse(layer, client, organizationId)
