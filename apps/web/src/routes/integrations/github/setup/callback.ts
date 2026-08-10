import { claimGithubInstallationUseCase, GithubIntegrationConflictError } from "@domain/github"
import { GithubIntegrationRepositoryLive, GithubSyncConfigRepositoryLive, withPostgres } from "@platform/db-postgres"
import { parseEnv } from "@platform/env"
import { exchangeOAuthCode, getInstallation, listUserInstallations, loadGithubConfig } from "@platform/github"
import { createLogger, withTracing } from "@repo/observability"
import { createFileRoute } from "@tanstack/react-router"
import { Effect, Layer } from "effect"
import { getPostgresClient, getRedisClient } from "../../../../server/clients.ts"
import { consumeGithubInstallState } from "../../../../server/github-oauth-state.ts"

const logger = createLogger("github-setup-callback")

type FlashStatus =
  | "githubInstalled=ok"
  | "githubPending=approval"
  | "githubError=installation_taken"
  | "githubError=verification_failed"
  | "githubError=oauth_failed"

const narrowAccountType = (value: string) => (value === "User" ? "User" : "Organization")
const narrowRepositorySelection = (value: string) => (value === "selected" ? "selected" : "all")

export const buildGithubPostInstallRedirect = (input: {
  readonly status: FlashStatus
  readonly webUrl: string
}): Response => {
  const headers = new Headers()
  headers.set("Location", `${input.webUrl}/?next=integrations&${input.status}`)
  headers.set("Cache-Control", "no-store")
  return new Response(null, { status: 302, headers })
}

/** `Effect.runPromise` wraps a domain failure in a FiberFailure; the tagged cause is one level in. */
export const isGithubInstallationConflict = (cause: unknown): boolean => {
  if (cause instanceof GithubIntegrationConflictError) return true
  const inner = (cause as { cause?: { _tag?: string } })?.cause
  return inner?._tag === "GithubIntegrationConflictError"
}

/**
 * GitHub App setup callback. GitHub's `installation_id` redirect is spoofable,
 * so we exchange the OAuth `code` for a user token and confirm via
 * `GET /user/installations` that the installing user actually owns the
 * installation before claiming it (5.2).
 */
export const Route = createFileRoute("/integrations/github/setup/callback")({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        const rawWebUrl = await Effect.runPromise(parseEnv("LAT_WEB_URL", "string", "http://localhost:3000"))
        const webUrl = rawWebUrl.replace(/\/$/, "")

        const url = new URL(request.url)
        const state = url.searchParams.get("state")
        const code = url.searchParams.get("code")
        const setupAction = url.searchParams.get("setup_action")
        const installationIdParam = url.searchParams.get("installation_id")

        if (!state) {
          logger.warn("github setup callback missing state")
          return buildGithubPostInstallRedirect({ status: "githubError=oauth_failed", webUrl })
        }

        const stateEntry = await consumeGithubInstallState({ redis: getRedisClient(), state })
        if (!stateEntry) {
          logger.warn("github install state not found, expired, or already consumed")
          return buildGithubPostInstallRedirect({ status: "githubError=oauth_failed", webUrl })
        }

        // A non-admin installer gets `setup_action=request` (and no `installation_id`): GitHub
        // recorded a request pending an org admin's approval, so there is nothing to claim yet.
        if (setupAction === "request") {
          logger.info("github install pending org admin approval", { organizationId: stateEntry.organizationId })
          return buildGithubPostInstallRedirect({ status: "githubPending=approval", webUrl })
        }

        const installationId = Number(installationIdParam)
        if (!code || !installationIdParam || !Number.isInteger(installationId)) {
          logger.info("github setup callback missing code or installation_id")
          return buildGithubPostInstallRedirect({ status: "githubError=oauth_failed", webUrl })
        }

        const config = await Effect.runPromise(loadGithubConfig)
        if (!config) {
          logger.warn("github config missing at callback time")
          return buildGithubPostInstallRedirect({ status: "githubError=oauth_failed", webUrl })
        }

        try {
          const userAccessToken = await Effect.runPromise(
            exchangeOAuthCode({
              config,
              code,
              redirectUri: `${webUrl}/integrations/github/setup/callback`,
            }),
          )

          const userInstallations = await Effect.runPromise(listUserInstallations({ config, userAccessToken }))
          if (!userInstallations.includes(installationId)) {
            logger.warn("github installation_id not owned by the installing user (possible spoof)", { installationId })
            return buildGithubPostInstallRedirect({ status: "githubError=verification_failed", webUrl })
          }

          const metadata = await Effect.runPromise(getInstallation({ config, installationId }))

          await Effect.runPromise(
            claimGithubInstallationUseCase({
              organizationId: stateEntry.organizationId,
              installedByUserId: stateEntry.userId,
              installationId,
              accountLogin: metadata.accountLogin,
              accountType: narrowAccountType(metadata.accountType),
              repositorySelection: narrowRepositorySelection(metadata.repositorySelection),
            }).pipe(
              withPostgres(
                Layer.mergeAll(GithubIntegrationRepositoryLive, GithubSyncConfigRepositoryLive),
                getPostgresClient(),
                stateEntry.organizationId,
              ),
              withTracing,
            ),
          )

          return buildGithubPostInstallRedirect({ status: "githubInstalled=ok", webUrl })
        } catch (cause) {
          if (isGithubInstallationConflict(cause)) {
            logger.info("github installation already claimed by another organization", { installationId })
            return buildGithubPostInstallRedirect({ status: "githubError=installation_taken", webUrl })
          }
          logger.error("github setup callback failed", cause)
          return buildGithubPostInstallRedirect({ status: "githubError=oauth_failed", webUrl })
        }
      },
    },
  },
})
