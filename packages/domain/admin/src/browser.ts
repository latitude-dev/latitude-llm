/**
 * Client entry for `@domain/admin`: the slice of the admin surface the backoffice UI needs, and
 * nothing else.
 *
 * The root barrel re-exports every feature's use-cases and ports, so importing it from a route
 * pulls the whole server graph — `@domain/spans`, the pricing catalog, the repository layers — into
 * the client bundle, where some of it does not even resolve. Keep this file to values that are pure
 * and types that erase.
 *
 * ⚠️ There is no `types` condition on this entry, so TypeScript resolves `@domain/admin` to the
 * root barrel either way: a symbol missing here still typechecks and only fails at `pnpm build`.
 * Add a client import and build the web app before trusting it.
 */
export {
  adminOrganizationUsageCursorSchema,
  ORGANIZATION_USAGE_DEFAULT_LIMIT,
  ORGANIZATION_USAGE_MAX_LIMIT,
  ORGANIZATION_USAGE_WINDOW_DAYS,
} from "./organizations/organization-usage-summary.ts"
export type { SearchEntityType } from "./search/search-result.ts"
export {
  MAX_SEARCH_QUERY_LENGTH,
  MIN_SEARCH_QUERY_LENGTH,
  searchEntityTypeSchema,
} from "./search/search-result.ts"
