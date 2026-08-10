import type { TaskPayload } from "@domain/queue"

/** PR actions the receiver forwards (5.7). Other actions are acked and dropped. */
const MONITORED_PR_ACTIONS = [
  "opened",
  "edited",
  "reopened",
  "closed",
  "ready_for_review",
  "converted_to_draft",
] as const

/** Per-push commit cap for matching; beyond it the payload is flagged `truncated` (5.7). */
export const PUSH_COMMIT_CAP = 100
/** Per-commit message cap before enqueue (BullMQ payloads live in Redis). */
const COMMIT_MESSAGE_MAX_CHARS = 16 * 1024

type PullRequestTask = TaskPayload<"github-events", "pull-request">
type PushTask = TaskPayload<"github-events", "push">
type InstallationTask = TaskPayload<"github-events", "installation">

type GithubWebhookRoute =
  | { readonly kind: "ping" }
  | { readonly kind: "ignore" }
  | { readonly kind: "pull-request"; readonly task: PullRequestTask }
  | { readonly kind: "push"; readonly task: PushTask }
  | { readonly kind: "installation"; readonly task: InstallationTask }

const asRecord = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {}

const str = (value: unknown): string => (typeof value === "string" ? value : "")
const strOrNull = (value: unknown): string | null => (typeof value === "string" ? value : null)
const bool = (value: unknown): boolean => value === true
const num = (value: unknown): number => (typeof value === "number" ? value : 0)
const numOrNull = (value: unknown): number | null => (typeof value === "number" ? value : null)

const installationId = (body: Record<string, unknown>): number => num(asRecord(body.installation).id)

const extractPullRequest = (deliveryId: string, body: Record<string, unknown>): PullRequestTask => {
  const pr = asRecord(body.pull_request)
  const repo = asRecord(body.repository)
  const head = asRecord(pr.head)
  const headRepo = asRecord(head.repo)
  const base = asRecord(pr.base)
  const changesBase = asRecord(asRecord(asRecord(body.changes).base).ref)
  return {
    deliveryId,
    installationId: installationId(body),
    repoId: num(repo.id),
    repoFullName: str(repo.full_name),
    action: str(body.action),
    prNumber: num(pr.number),
    title: str(pr.title),
    body: strOrNull(pr.body),
    state: str(pr.state),
    draft: bool(pr.draft),
    merged: bool(pr.merged),
    mergeCommitSha: strOrNull(pr.merge_commit_sha),
    mergedAt: strOrNull(pr.merged_at),
    headRef: str(head.ref),
    headSha: str(head.sha),
    headRepoId: numOrNull(headRepo.id),
    baseRef: str(base.ref),
    htmlUrl: str(pr.html_url),
    userLogin: str(asRecord(pr.user).login),
    authorAssociation: str(pr.author_association),
    changesBaseRef: strOrNull(changesBase.from),
  }
}

const extractPush = (deliveryId: string, body: Record<string, unknown>): PushTask => {
  const repo = asRecord(body.repository)
  const rawCommits = Array.isArray(body.commits) ? body.commits : []
  const truncated = rawCommits.length > PUSH_COMMIT_CAP
  const commits = rawCommits.slice(0, PUSH_COMMIT_CAP).map((entry) => {
    const commit = asRecord(entry)
    return {
      id: str(commit.id),
      message: str(commit.message).slice(0, COMMIT_MESSAGE_MAX_CHARS),
      timestamp: str(commit.timestamp),
      authorUsername: strOrNull(asRecord(commit.author).username),
      url: str(commit.url),
    }
  })
  return {
    deliveryId,
    installationId: installationId(body),
    repoId: num(repo.id),
    repoFullName: str(repo.full_name),
    defaultBranch: str(repo.default_branch),
    ref: str(body.ref),
    before: str(body.before),
    after: str(body.after),
    created: bool(body.created),
    deleted: bool(body.deleted),
    forced: bool(body.forced),
    commits,
    truncated,
  }
}

const extractInstallation = (
  deliveryId: string,
  event: "installation" | "installation_repositories",
  body: Record<string, unknown>,
): InstallationTask => {
  const installation = asRecord(body.installation)
  const account = asRecord(installation.account)
  return {
    deliveryId,
    installationId: installationId(body),
    event,
    action: str(body.action),
    accountLogin: str(account.login),
    accountType: str(account.type),
    repositorySelection: str(installation.repository_selection),
  }
}

/**
 * Routing + slim-extraction for a verified GitHub webhook. Pure so the event
 * filtering and payload shape are unit-tested without HTTP (5.7). Unmonitored
 * events/actions and `ping` never touch the queue.
 */
export const routeGithubWebhook = (input: {
  readonly event: string
  readonly deliveryId: string
  readonly body: unknown
}): GithubWebhookRoute => {
  if (input.event === "ping") return { kind: "ping" }
  const body = asRecord(input.body)

  switch (input.event) {
    case "pull_request": {
      if (!(MONITORED_PR_ACTIONS as readonly string[]).includes(str(body.action))) return { kind: "ignore" }
      return { kind: "pull-request", task: extractPullRequest(input.deliveryId, body) }
    }
    case "push":
      return { kind: "push", task: extractPush(input.deliveryId, body) }
    case "installation":
      return { kind: "installation", task: extractInstallation(input.deliveryId, "installation", body) }
    case "installation_repositories":
      return { kind: "installation", task: extractInstallation(input.deliveryId, "installation_repositories", body) }
    default:
      return { kind: "ignore" }
  }
}
