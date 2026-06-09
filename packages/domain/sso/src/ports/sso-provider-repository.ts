import type { RepositoryError, SqlClient } from "@domain/shared"
import { Context, type Effect } from "effect"
import type { SsoProvider } from "../entities/sso-provider.ts"

/**
 * Reads/writes against `sso_providers`. RLS notes:
 *
 * - `findForOrganization` / `setEnforced` / `deleteForOrganization` are
 *   tenant reads: run them through the regular tenant client so RLS scopes
 *   them to the active organization.
 * - `findVerifiedByDomain` powers the **unauthenticated** login-time lookup
 *   and MUST run through the admin client (the tenant role silently sees
 *   nothing pre-auth under RLS).
 *
 * Provider registration is not on this port — it goes through Better Auth's
 * `auth.api.registerSSOProvider` so the plugin keeps owning the config blobs.
 */
export interface SsoProviderRepositoryShape {
  /** The active organization's provider, if any (orgs have at most one). */
  findForOrganization(): Effect.Effect<SsoProvider | null, RepositoryError, SqlClient>
  /** Verified provider claiming `domain` (lowercase), regardless of org. */
  findVerifiedByDomain(domain: string): Effect.Effect<SsoProvider | null, RepositoryError, SqlClient>
  /** Toggle the app-extended `enforced` column on the active org's provider. */
  setEnforced(enforced: boolean): Effect.Effect<void, RepositoryError, SqlClient>
  /** Delete the active org's provider. */
  deleteForOrganization(): Effect.Effect<void, RepositoryError, SqlClient>
}

export class SsoProviderRepository extends Context.Service<SsoProviderRepository, SsoProviderRepositoryShape>()(
  "@domain/sso/SsoProviderRepository",
) {}
