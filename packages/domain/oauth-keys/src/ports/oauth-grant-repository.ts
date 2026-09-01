import type { OrganizationId, RepositoryError, SqlClient, UserId } from "@domain/shared"
import { Context, type Effect } from "effect"

export interface OAuthGrantInput {
  readonly application: {
    readonly id: string
    readonly name: string
    readonly icon: string | null
    readonly metadata: string
    readonly clientId: string
    readonly clientSecret: string
    /** Comma-joined list of exact callback URLs; never empty, or the client can't ever re-authorize interactively. */
    readonly redirectUrls: string
    readonly type: string
    readonly userId: UserId
    readonly organizationId: OrganizationId
  }
  readonly token: {
    readonly id: string
    readonly accessToken: string
    readonly refreshToken: string
    readonly accessTokenExpiresAt: Date
    readonly refreshTokenExpiresAt: Date
    readonly clientId: string
    readonly userId: UserId
    readonly scopes: string
  }
  readonly consent: {
    readonly id: string
    readonly clientId: string
    readonly userId: UserId
    readonly scopes: string
  }
}

/**
 * Writes the three rows Better Auth's consent flow would have produced —
 * application, access token, consent — for a grant issued without any
 * interaction. Used by partner account provisioning; path A still goes through
 * Better Auth itself.
 */
export class OAuthGrantRepository extends Context.Service<
  OAuthGrantRepository,
  {
    /**
     * Inserts all three rows. `oauth_applications` is RLS-scoped, so the
     * implementation writes the organization id from the RLS context rather
     * than from `input.application` — a caller cannot bind an application to
     * an org its transaction isn't scoped to.
     */
    createGrant: (input: OAuthGrantInput) => Effect.Effect<void, RepositoryError, SqlClient>
  }
>()("@domain/oauth-keys/OAuthGrantRepository") {}
