import type { RepositoryError, SqlClient } from "@domain/shared"
import { Context, type Effect } from "effect"
import type { OAuthKey } from "../entities/oauth-key.ts"

/**
 * Port for busting cached OAuth-token validations on revoke. The platform
 * implementation lives in `@platform/oauth-token-auth`
 * (`OAuthTokenCacheInvalidatorLive`) so the domain stays free of any
 * Redis / cache-key knowledge.
 *
 * Errors are absorbed by the implementation — the DB is the source of
 * truth, so a missed invalidation degrades to the validator's TTL window
 * rather than crashing the revoke flow.
 */
export class OAuthTokenCacheInvalidator extends Context.Service<
  OAuthTokenCacheInvalidator,
  {
    /** Drops the cached positive-validation entry for the given access token. */
    invalidate: (accessToken: string) => Effect.Effect<void, never>
  }
>()("@domain/oauth-keys/OAuthTokenCacheInvalidator") {}

/**
 * Repository port for the OAuth-keys settings surface. Every method resolves
 * `SqlClient` per call (per the platform convention) so the RLS policy on
 * `oauth_applications` enforces tenant scoping automatically — no method
 * accepts `organizationId`. The use-cases compose these primitives.
 *
 * `oauth_access_tokens` and `oauth_consents` have no RLS by design — the
 * tenant scope is enforced by the JOIN through `oauth_applications`. The
 * write methods on tokens reflect that: they take a `clientId` and assume
 * the caller has already verified ownership via `findApplicationInOrganization`.
 */
export class OAuthKeyRepository extends Context.Service<
  OAuthKeyRepository,
  {
    /**
     * Lists every connected OAuth key in the caller's organization, ordered
     * by most recently connected first. JOIN-and-GROUP across
     * `oauth_applications → oauth_access_tokens → users`. RLS on the parent
     * application limits visibility to the active org.
     */
    listForOrganization: () => Effect.Effect<readonly OAuthKey[], RepositoryError, SqlClient>
    /**
     * Reads a single OAuth key by its `(clientId, userId)` pair, returning
     * the same aggregated shape `listForOrganization` produces. Returns
     * `null` when the pair doesn't resolve under the caller's organization
     * (RLS-scoped, so cross-tenant access collapses to the same null).
     */
    findByPair: (input: {
      readonly clientId: string
      readonly userId: string
    }) => Effect.Effect<OAuthKey | null, RepositoryError, SqlClient>
    /**
     * Returns `true` when the given `clientId` resolves to an OAuth
     * application in the caller's organization. Implemented as an
     * RLS-scoped read — a cross-tenant client returns `false` exactly
     * the same way as a non-existent one.
     */
    applicationBelongsToOrganization: (clientId: string) => Effect.Effect<boolean, RepositoryError, SqlClient>
    /**
     * Deletes every `oauth_access_tokens` row for the given pair and
     * returns the plaintext `access_token` values that were removed.
     * Callers feed those back through `OAuthTokenCacheInvalidator` so
     * the Redis-cached positive validations don't keep a revoked token
     * usable until its TTL expires. The tokens table has no RLS, so
     * callers MUST verify org ownership via
     * `applicationBelongsToOrganization` first.
     */
    deleteTokensForPair: (input: {
      readonly clientId: string
      readonly userId: string
    }) => Effect.Effect<readonly string[], RepositoryError, SqlClient>
    /**
     * Returns `true` when at least one `oauth_access_tokens` row remains
     * for the given `clientId` (any user). Used to decide whether to
     * disable the application after a revoke.
     */
    hasRemainingTokensForApplication: (clientId: string) => Effect.Effect<boolean, RepositoryError, SqlClient>
    /**
     * Marks the OAuth application disabled. RLS-scoped on
     * `oauth_applications` — the update only matches when the row
     * belongs to the caller's organization.
     */
    markApplicationDisabled: (clientId: string) => Effect.Effect<void, RepositoryError, SqlClient>
  }
>()("@domain/oauth-keys/OAuthKeyRepository") {}
