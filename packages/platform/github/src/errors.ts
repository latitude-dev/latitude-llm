import { Data } from "effect"

/**
 * Whether a GitHub API failure should be acked (dropped) or retried by the
 * worker. `auth`/`client` are terminal (bad credentials or a malformed request
 * never succeed on retry); `rate_limited`/`transient` are worth another attempt.
 */
export type GithubApiErrorCategory = "auth" | "rate_limited" | "transient" | "not_found" | "client"

export const isRetryableGithubApiError = (category: GithubApiErrorCategory): boolean =>
  category === "rate_limited" || category === "transient"

export class InvalidGithubSignatureError extends Data.TaggedError("InvalidGithubSignatureError")<{
  readonly reason: "format" | "missing" | "mismatch"
}> {
  override get message() {
    return `Invalid GitHub signature: ${this.reason}`
  }
}

export class GithubConfigError extends Data.TaggedError("GithubConfigError")<{
  readonly reason: string
  readonly cause?: unknown
}> {
  override get message() {
    return `GitHub App is misconfigured: ${this.reason}`
  }
}

export class GithubJwtError extends Data.TaggedError("GithubJwtError")<{
  readonly cause: unknown
}> {
  override get message() {
    return "Failed to sign GitHub App JWT"
  }
}

export class GithubApiError extends Data.TaggedError("GithubApiError")<{
  readonly operation: string
  readonly category: GithubApiErrorCategory
  readonly status?: number
  readonly retryAfterSec?: number
  readonly cause?: unknown
}> {
  override get message() {
    return `GitHub API call failed (${this.operation}, ${this.category})`
  }
}
