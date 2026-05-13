/**
 * Row returned by the OAuth-keys list. One per `(client_id, user_id)` pair
 * — multiple access tokens for the same pair (refreshes) collapse into a
 * single row, with `lastActivityAt` and `connectedAt` aggregated across them.
 *
 * Branded ids: this is a read view assembled from BA-owned tables, so we
 * surface the raw strings rather than mint domain-branded ids. Callers that
 * want to act on a row (e.g. revoke) pass `clientId` + `userId` back.
 */
export interface OAuthKey {
  /** Composite identifier — neither id alone is unique across rows. */
  readonly id: string
  readonly clientId: string
  readonly clientName: string | null
  readonly clientIcon: string | null
  readonly userId: string
  readonly userName: string | null
  readonly userEmail: string
  /** Most recent `updated_at` across the pair's access tokens. */
  readonly lastActivityAt: Date | null
  /** When this OAuth key was connected — most recent token's `created_at`. */
  readonly connectedAt: Date
  readonly disabled: boolean
}
