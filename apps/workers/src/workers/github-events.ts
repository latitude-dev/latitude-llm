import {
  deleteGithubProjectDataUseCase,
  GithubDeliveryRepository,
  type GithubInstallationChange,
  processGithubPullRequestUseCase,
  processGithubPushUseCase,
  syncGithubInstallationUseCase,
} from "@domain/github"
import type { QueueConsumer, TaskPayload } from "@domain/queue"
import { OrganizationId, ProjectId } from "@domain/shared"
import {
  EvaluationRepositoryLive,
  findActiveGithubInstallationAcrossOrgs,
  GithubDeliveryRepositoryLive,
  GithubIntegrationRepositoryLive,
  GithubSignalReferenceRepositoryLive,
  GithubSyncConfigRepositoryLive,
  OutboxEventWriterLive,
  type PostgresClient,
  ProjectRepositoryLive,
  SettingsReaderLive,
  SignalRepositoryLive,
  withPostgres,
} from "@platform/db-postgres"
import { createLogger, withTracing } from "@repo/observability"
import { Effect, Layer } from "effect"

const logger = createLogger("github-events")

type PullRequestPayload = TaskPayload<"github-events", "pull-request">
type PushPayload = TaskPayload<"github-events", "push">
type InstallationPayload = TaskPayload<"github-events", "installation">
type DeleteByProjectPayload = TaskPayload<"github-events", "delete-by-project">

const narrowAccountType = (value: string) => (value === "User" ? "User" : "Organization")
const narrowRepositorySelection = (value: string) => (value === "selected" ? "selected" : "all")

/** Maps a raw installation webhook (event, action) to a normalized change, or null to ignore it (5.2). */
const decodeInstallationChange = (payload: InstallationPayload): GithubInstallationChange | null => {
  if (payload.event === "installation_repositories") {
    return {
      kind: "metadata",
      accountLogin: payload.accountLogin,
      accountType: narrowAccountType(payload.accountType),
      repositorySelection: narrowRepositorySelection(payload.repositorySelection),
    }
  }
  switch (payload.action) {
    case "deleted":
      return { kind: "revoked" }
    case "suspend":
      return { kind: "suspended", suspendedAt: new Date() }
    case "unsuspend":
      return { kind: "unsuspended" }
    case "new_permissions_accepted":
      return {
        kind: "metadata",
        accountLogin: payload.accountLogin,
        accountType: narrowAccountType(payload.accountType),
        repositorySelection: narrowRepositorySelection(payload.repositorySelection),
      }
    default:
      return null
  }
}

const installationLayer = Layer.mergeAll(
  GithubIntegrationRepositoryLive,
  GithubSyncConfigRepositoryLive,
  GithubDeliveryRepositoryLive,
)

const cleanupLayer = Layer.mergeAll(GithubSyncConfigRepositoryLive, GithubSignalReferenceRepositoryLive)

const processingLayer = Layer.mergeAll(
  GithubIntegrationRepositoryLive,
  GithubSyncConfigRepositoryLive,
  GithubDeliveryRepositoryLive,
  GithubSignalReferenceRepositoryLive,
  SignalRepositoryLive,
  EvaluationRepositoryLive,
  OutboxEventWriterLive,
  SettingsReaderLive,
  ProjectRepositoryLive,
)

export const createGithubEventsWorker = ({
  consumer,
  postgresClient,
  adminPostgresClient,
}: {
  consumer: QueueConsumer
  postgresClient: PostgresClient
  adminPostgresClient: PostgresClient
}) => {
  const handleInstallation = (payload: InstallationPayload) =>
    Effect.gen(function* () {
      const resolved = yield* findActiveGithubInstallationAcrossOrgs(adminPostgresClient.db, payload.installationId)
      if (!resolved) {
        logger.info("dropping installation event for unclaimed installation", {
          installationId: payload.installationId,
        })
        return
      }
      const change = decodeInstallationChange(payload)

      yield* Effect.gen(function* () {
        const deliveryRepo = yield* GithubDeliveryRepository
        const claim = yield* deliveryRepo.claim({
          deliveryId: payload.deliveryId,
          integrationId: resolved.id,
          event: payload.event,
          action: payload.action,
          repoId: null,
        })
        if (!claim.claimed || claim.id === null) return

        if (change === null) {
          yield* deliveryRepo.finalize({ id: claim.id, status: "skipped", skipReason: "unhandled-action" })
          return
        }
        yield* syncGithubInstallationUseCase({ integrationId: resolved.id, change })
        yield* deliveryRepo.finalize({ id: claim.id, status: "processed" })
      }).pipe(withPostgres(installationLayer, postgresClient, resolved.organizationId))
    }).pipe(withTracing, Effect.asVoid)

  const handlePullRequest = (payload: PullRequestPayload) =>
    Effect.gen(function* () {
      const resolved = yield* findActiveGithubInstallationAcrossOrgs(adminPostgresClient.db, payload.installationId)
      if (!resolved) {
        logger.info("dropping pull_request event for unclaimed installation", {
          installationId: payload.installationId,
        })
        return
      }
      yield* processGithubPullRequestUseCase({
        organizationId: resolved.organizationId,
        integrationId: resolved.id,
        deliveryId: payload.deliveryId,
        repoId: payload.repoId,
        repoFullName: payload.repoFullName,
        action: payload.action,
        prNumber: payload.prNumber,
        title: payload.title,
        body: payload.body,
        state: payload.state,
        draft: payload.draft,
        merged: payload.merged,
        mergeCommitSha: payload.mergeCommitSha,
        mergedAt: payload.mergedAt,
        headRef: payload.headRef,
        headSha: payload.headSha,
        headRepoId: payload.headRepoId,
        baseRef: payload.baseRef,
        htmlUrl: payload.htmlUrl,
        userLogin: payload.userLogin,
        authorAssociation: payload.authorAssociation,
        changesBaseRef: payload.changesBaseRef,
      }).pipe(withPostgres(processingLayer, postgresClient, resolved.organizationId))
    }).pipe(withTracing, Effect.asVoid)

  const handlePush = (payload: PushPayload) =>
    Effect.gen(function* () {
      const resolved = yield* findActiveGithubInstallationAcrossOrgs(adminPostgresClient.db, payload.installationId)
      if (!resolved) {
        logger.info("dropping push event for unclaimed installation", { installationId: payload.installationId })
        return
      }
      yield* processGithubPushUseCase({
        organizationId: resolved.organizationId,
        integrationId: resolved.id,
        deliveryId: payload.deliveryId,
        repoId: payload.repoId,
        repoFullName: payload.repoFullName,
        ref: payload.ref,
        before: payload.before,
        after: payload.after,
        created: payload.created,
        deleted: payload.deleted,
        forced: payload.forced,
        commits: payload.commits,
        truncated: payload.truncated,
      }).pipe(withPostgres(processingLayer, postgresClient, resolved.organizationId))
    }).pipe(withTracing, Effect.asVoid)

  const handleDeleteByProject = (payload: DeleteByProjectPayload) =>
    deleteGithubProjectDataUseCase({ projectId: ProjectId(payload.projectId) }).pipe(
      withPostgres(cleanupLayer, postgresClient, OrganizationId(payload.organizationId)),
      withTracing,
      Effect.asVoid,
    )

  consumer.subscribe("github-events", {
    installation: (payload) =>
      handleInstallation(payload).pipe(
        Effect.tapError((error) =>
          Effect.sync(() =>
            logger.error("github installation handler failed", { deliveryId: payload.deliveryId, error }),
          ),
        ),
      ),
    "pull-request": (payload: PullRequestPayload) =>
      handlePullRequest(payload).pipe(
        Effect.tapError((error) =>
          Effect.sync(() =>
            logger.error("github pull-request handler failed", { deliveryId: payload.deliveryId, error }),
          ),
        ),
      ),
    push: (payload: PushPayload) =>
      handlePush(payload).pipe(
        Effect.tapError((error) =>
          Effect.sync(() => logger.error("github push handler failed", { deliveryId: payload.deliveryId, error })),
        ),
      ),
    "delete-by-project": (payload: DeleteByProjectPayload) =>
      handleDeleteByProject(payload).pipe(
        Effect.tapError((error) =>
          Effect.sync(() =>
            logger.error("github delete-by-project handler failed", { projectId: payload.projectId, error }),
          ),
        ),
      ),
  })
}
