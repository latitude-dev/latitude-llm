import { OutboxEventWriter } from "@domain/events"
import { createProject, ProjectRepository } from "@domain/projects"
import { WorkflowStarter, type WorkflowStarterShape } from "@domain/queue"
import {
  type ApiKeyId,
  ConflictError,
  generateId,
  type OrganizationId,
  type ProjectId,
  SqlClient,
  toRepositoryError,
  toSlug,
  type UserId,
  ValidationError,
} from "@domain/shared"
import { Effect } from "effect"
import { AdminOrganizationRepository } from "./organization-repository.ts"

export interface CreateDemoProjectInput {
  readonly organizationId: OrganizationId
  /** User-supplied project name from the modal. Trimmed inside the use-case. */
  readonly projectName: string
  /** Platform admin who initiated the action. Used as the audit-event `adminUserId`. */
  readonly actorAdminUserId: UserId
}

export interface CreateDemoProjectResult {
  readonly projectId: ProjectId
  readonly projectSlug: string
  /**
   * The org member chosen as queue-item assignee for the seeded annotation
   * queues. Picked here (not in the workflow) because workflow code must be
   * deterministic across replays — `Math.random` inside an activity would
   * be a Temporal footgun.
   */
  readonly queueAssigneeUserId: UserId
}

const MAX_NAME_LENGTH = 256
const MAX_SLUG_SUFFIX_ATTEMPTS = 100

/**
 * Create a project on an existing organization for backoffice "Create Demo
 * Project". The use-case writes the project row directly via
 * `ProjectRepository.save`, deliberately bypassing `createProjectUseCase`
 * (which emits `ProjectCreated` and triggers the api-keys/PostHog/etc.
 * worker chain). The seeded data — datasets, evaluations, issues, queues,
 * scores, ~30 days of telemetry — is written by a Temporal workflow the
 * caller starts after this use-case returns.
 *
 * Guards (in order):
 * 1. Org exists.
 * 2. Project name is non-empty + ≤ 256 chars.
 * 3. No existing project on the same org has the same name. The user
 *    explicitly asked for fail-on-collision rather than auto-suffix.
 * 4. Slug derived from the name is non-empty + ≤ 256 chars; auto-suffix
 *    `-1`, `-2`, ... up to 100 tries if it collides at the (cross-org)
 *    DB level.
 * 5. Org has at least one member — otherwise we'd have no candidate to
 *    pin queue items to. (Empty-member orgs only exist as a degenerate
 *    state; this guard makes the failure mode loud rather than mysterious.)
 *
 * Emits one outbox event on success: `AdminDemoProjectSeeded`. The actual
 * seed workflow's progress is NOT modelled in the audit trail — reconcile
 * against the Temporal handle if a half-seeded project needs investigation.
 */
export const createDemoProjectUseCase = Effect.fn("admin.createDemoProject")(function* (input: CreateDemoProjectInput) {
  yield* Effect.annotateCurrentSpan("admin.targetOrganizationId", input.organizationId)

  const trimmedName = input.projectName.trim()
  if (!trimmedName) {
    return yield* new ValidationError({ field: "projectName", message: "Project name cannot be empty" })
  }
  if (trimmedName.length > MAX_NAME_LENGTH) {
    return yield* new ValidationError({
      field: "projectName",
      message: `Project name exceeds ${MAX_NAME_LENGTH} characters`,
    })
  }

  const trimmedSlug = toSlug(trimmedName)
  if (!trimmedSlug) {
    return yield* new ValidationError({
      field: "projectName",
      message: "Project name does not produce a valid slug — pick something with at least one alphanumeric character",
    })
  }
  if (trimmedSlug.length > MAX_NAME_LENGTH) {
    return yield* new ValidationError({
      field: "projectName",
      message: `Slug derived from project name exceeds ${MAX_NAME_LENGTH} characters — pick a shorter name`,
    })
  }

  const adminRepo = yield* AdminOrganizationRepository
  const org = yield* adminRepo.findById(input.organizationId)

  // Name collision check — staff explicitly chose fail-on-collision (not
  // auto-suffix) because they expect the name they typed to land verbatim
  // in the project list, or get a clear error.
  if (org.projects.some((project) => project.name === trimmedName)) {
    return yield* new ConflictError({ entity: "Project", field: "name", value: trimmedName })
  }

  if (org.members.length === 0) {
    return yield* new ValidationError({
      field: "organizationId",
      message: "Cannot seed a demo project for an organization with no members",
    })
  }

  // Pick a random member from the org. Using `Math.random` is fine here
  // because this runs inside the request handler, not the Temporal
  // workflow — the result is captured on the audit event and threaded
  // forward as workflow input, so replays see the same value.
  const pickedMember = org.members[Math.floor(Math.random() * org.members.length)]
  if (!pickedMember) {
    // Unreachable given the length check above, but TypeScript narrows
    // through length checks and the picker still returns `T | undefined`.
    return yield* new ValidationError({
      field: "organizationId",
      message: "Unable to pick a queue assignee from the organization",
    })
  }

  const queueAssigneeUserId = pickedMember.user.id as UserId

  // Pull the org's existing default api key so the seeded ClickHouse
  // spans reference a key that actually exists on the target org. With
  // out this, telemetry rows would point at `SEED_API_KEY_ID` (the
  // canonical seed org's key, invalid on every other org) and any UI
  // that filters by `api_key_id` would drop them. Fail loud for orgs
  // with no api keys — that's a degenerate state, not something to
  // silently work around.
  const apiKeyId = yield* adminRepo.findFirstApiKeyId(input.organizationId)
  if (apiKeyId === null) {
    return yield* new ValidationError({
      field: "organizationId",
      message: "Cannot seed a demo project for an organization with no api keys",
    })
  }

  const result = yield* writeDemoProjectRow({
    organizationId: input.organizationId,
    actorAdminUserId: input.actorAdminUserId,
    trimmedName,
    trimmedSlug,
    queueAssigneeUserId,
  })

  // Kick off the seed workflow. We start AFTER the project row + audit
  // event have committed so a transient Temporal failure doesn't leave a
  // ghost project with no audit trail. The workflow id is namespaced by
  // the project id, which gives us a free idempotency guard — re-issuing
  // the same start (e.g. from a retried server-fn call after the
  // transaction committed but the response didn't reach the client)
  // lands on the existing handle.
  //
  // `WorkflowAlreadyStartedError` is the recoverable case: a workflow
  // for this project is already running, which is exactly what the
  // caller wanted. Treat it as success and return the existing
  // result. Other Temporal failures (network, permission) propagate as
  // defects.
  const workflowStarter = yield* WorkflowStarter
  yield* startSeedDemoProjectWorkflow(workflowStarter, {
    organizationId: input.organizationId,
    projectId: result.projectId,
    queueAssigneeUserIds: [queueAssigneeUserId],
    apiKeyId,
    timelineAnchorIso: new Date().toISOString(),
  }).pipe(Effect.catchTag("WorkflowAlreadyStartedError", () => Effect.void))

  return result
})

const startSeedDemoProjectWorkflow = (
  workflowStarter: WorkflowStarterShape,
  input: {
    readonly organizationId: OrganizationId
    readonly projectId: ProjectId
    readonly queueAssigneeUserIds: readonly UserId[]
    readonly apiKeyId: ApiKeyId
    readonly timelineAnchorIso: string
  },
) =>
  workflowStarter.start(
    "seedDemoProjectWorkflow",
    {
      organizationId: input.organizationId,
      projectId: input.projectId,
      queueAssigneeUserIds: input.queueAssigneeUserIds,
      apiKeyId: input.apiKeyId,
      timelineAnchorIso: input.timelineAnchorIso,
    },
    {
      workflowId: `admin:seed-demo-project:${input.projectId}`,
    },
  )

/**
 * Inner step that runs under a transaction so the project row + audit
 * event commit atomically. Slug auto-suffix lives inside the transaction
 * so two concurrent demo-project creations don't both grab the same slug.
 */
const writeDemoProjectRow = (params: {
  readonly organizationId: OrganizationId
  readonly actorAdminUserId: UserId
  readonly trimmedName: string
  readonly trimmedSlug: string
  readonly queueAssigneeUserId: UserId
}) =>
  Effect.gen(function* () {
    const sqlClient = yield* SqlClient

    return yield* sqlClient.transaction(
      Effect.gen(function* () {
        const projectRepo = yield* ProjectRepository
        const outboxEventWriter = yield* OutboxEventWriter

        let uniqueSlug = params.trimmedSlug
        let found = false
        for (let attempt = 1; attempt <= MAX_SLUG_SUFFIX_ATTEMPTS; attempt++) {
          const exists = yield* projectRepo.existsBySlug(uniqueSlug)
          if (!exists) {
            found = true
            break
          }
          uniqueSlug = `${params.trimmedSlug}-${attempt}`
        }
        if (!found) {
          return yield* new ValidationError({
            field: "projectName",
            message: "Could not generate a unique project slug — try a different name",
          })
        }

        const project = createProject({
          id: generateId<"ProjectId">(),
          organizationId: params.organizationId,
          name: params.trimmedName,
          slug: uniqueSlug,
        })
        yield* projectRepo.save(project)

        // Audit event. Note: the `aggregateId` is the new project id, not
        // the org id — admins investigating "what did we do to project X?"
        // can grep the outbox by aggregate. `organizationId` on the
        // envelope is `"system"` to match the impersonation/role-change
        // events; this is a platform-staff action, not a tenant action.
        yield* outboxEventWriter
          .write({
            eventName: "AdminDemoProjectSeeded",
            aggregateType: "project",
            aggregateId: project.id,
            organizationId: "system",
            payload: {
              adminUserId: params.actorAdminUserId,
              organizationId: params.organizationId,
              projectId: project.id,
              projectName: params.trimmedName,
            },
          })
          .pipe(Effect.mapError((error) => toRepositoryError(error, "write")))

        return {
          projectId: project.id,
          projectSlug: project.slug,
          queueAssigneeUserId: params.queueAssigneeUserId,
        } satisfies CreateDemoProjectResult
      }),
    )
  })
