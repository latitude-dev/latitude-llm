import { Data } from "effect"

/**
 * Raised when a claim collides with an installation already active in another
 * Latitude organization. One installation is claimable by at most one org
 * (partial unique on `(kind, vendor_account_id) WHERE revoked_at IS NULL`).
 */
export class GithubIntegrationConflictError extends Data.TaggedError("GithubIntegrationConflictError")<{
  readonly installationId: number
}> {
  readonly httpStatus = 409
  get httpMessage() {
    return "This GitHub installation is already connected to another Latitude organization"
  }
}

export class GithubIntegrationNotFoundError extends Data.TaggedError("GithubIntegrationNotFoundError")<{
  readonly reason: "not_connected" | "unknown_installation"
}> {
  readonly httpStatus = 404
  get httpMessage() {
    return "GitHub integration not found or not active for the current organization"
  }
}

/**
 * Raised when a project repo config names a repository the org's installation
 * cannot see. Bindings are validated server-side against the installation's
 * own repositories, not client input — the load-bearing D13 check.
 */
export class GithubRepoNotInInstallationError extends Data.TaggedError("GithubRepoNotInInstallationError")<{
  readonly repoId: number
}> {
  readonly httpStatus = 422
  get httpMessage() {
    return "That repository is not part of this organization's GitHub installation"
  }
}
