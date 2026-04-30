import { OutboxEventWriter, type OutboxWriteEvent } from "@domain/events"
import { type Project, ProjectRepository } from "@domain/projects"
import { WorkflowAlreadyStartedError, WorkflowStarter, type WorkflowStarterShape } from "@domain/queue"
import { type ApiKeyId, type OrganizationId, ProjectId, SqlClient, type UserId } from "@domain/shared"
import { createFakeSqlClient } from "@domain/shared/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { createDemoProjectUseCase } from "./create-demo-project.ts"
import type {
  AdminOrganizationDetails,
  AdminOrganizationMember,
  AdminOrganizationProject,
} from "./organization-details.ts"
import { AdminOrganizationRepository } from "./organization-repository.ts"

// Repository / outbox ports don't validate id shape; the use-case calls
// `createProject` (which schema-checks via `projectIdSchema`/`organizationIdSchema`,
// both `cuidSchema` length-24). Use 24-char fixture ids so the entity factory
// accepts them.
const ORG_ID = "orgxxxxxxxxxxxxxxxxxxxxx" as OrganizationId
const ADMIN_ID = "userstaffxxxxxxxxxxxxxxx" as UserId

const padId = (kind: string, id: string): string => `${kind}${id}`.padEnd(24, "x").slice(0, 24)

const member = (id: string, role: AdminOrganizationMember["role"] = "member"): AdminOrganizationMember => ({
  membershipId: padId("mem", id),
  role,
  user: {
    id: padId("usr", id),
    email: `${id}@acme.com`,
    name: id,
    image: null,
    role: "user",
  },
})

const mkOrg = (overrides: Partial<AdminOrganizationDetails> = {}): AdminOrganizationDetails => ({
  id: ORG_ID,
  name: "Acme",
  slug: "acme",
  stripeCustomerId: null,
  members: [member("user-1"), member("user-2"), member("user-3")],
  projects: [],
  createdAt: new Date("2024-01-01"),
  updatedAt: new Date("2024-01-01"),
  ...overrides,
})

const mkProject = (id: string, name: string): AdminOrganizationProject => ({
  id,
  name,
  slug: name.toLowerCase().replace(/\s+/g, "-"),
  createdAt: new Date("2024-01-01"),
})

interface StartedWorkflow {
  readonly name: string
  readonly input: unknown
  readonly options: unknown
}

interface FakeWorld {
  readonly outbox: OutboxWriteEvent[]
  readonly savedProjects: Project[]
  readonly existingSlugs: Set<string>
  readonly workflows: StartedWorkflow[]
}

const FAKE_API_KEY_ID = "apikeyxxxxxxxxxxxxxxxxxxx" as ApiKeyId

const buildLayer = (
  org: AdminOrganizationDetails,
  apiKeyId: ApiKeyId | null = FAKE_API_KEY_ID,
  /**
   * Inject a custom workflow-start outcome — used by the
   * "treats `WorkflowAlreadyStartedError` as success" test to assert
   * the use-case recovers from idempotent retries.
   */
  startBehavior: "ok" | "already-started" = "ok",
) => {
  const world: FakeWorld = {
    outbox: [],
    savedProjects: [],
    existingSlugs: new Set<string>(),
    workflows: [],
  }

  const adminRepo = Layer.succeed(AdminOrganizationRepository, {
    findById: () => Effect.succeed(org),
    findFirstApiKeyId: () => Effect.succeed(apiKeyId),
  })

  // The use-case only calls `save` + `existsBySlug`; cast through the full
  // shape so we don't have to stub the rest of the port.
  const projectRepo = Layer.succeed(ProjectRepository, {
    save: (project: Project) =>
      Effect.sync(() => {
        world.savedProjects.push(project)
      }),
    existsBySlug: (slug: string) => Effect.succeed(world.existingSlugs.has(slug)),
  } as unknown as (typeof ProjectRepository)["Service"])

  const outbox = Layer.succeed(OutboxEventWriter, {
    write: (event: OutboxWriteEvent) =>
      Effect.sync(() => {
        world.outbox.push(event)
      }),
  })

  const sqlClient = Layer.succeed(SqlClient, createFakeSqlClient({ organizationId: ORG_ID }))

  const workflowStarter: WorkflowStarterShape = {
    start: (name, input, options) => {
      world.workflows.push({ name, input, options })
      return startBehavior === "already-started"
        ? Effect.fail(new WorkflowAlreadyStartedError({ workflow: name, workflowId: options.workflowId }))
        : Effect.void
    },
    signalWithStart: () => Effect.void,
  }
  const workflowStarterLayer = Layer.succeed(WorkflowStarter, workflowStarter)

  return { layer: Layer.mergeAll(adminRepo, projectRepo, outbox, sqlClient, workflowStarterLayer), world }
}

describe("createDemoProjectUseCase", () => {
  it("creates the project, picks a member as queue assignee, and emits AdminDemoProjectSeeded", async () => {
    const org = mkOrg()
    const { layer, world } = buildLayer(org)

    const result = await Effect.runPromise(
      createDemoProjectUseCase({
        organizationId: ORG_ID,
        projectName: "  My Demo Project  ",
        actorAdminUserId: ADMIN_ID,
      }).pipe(Effect.provide(layer)),
    )

    // Project saved with trimmed name + slug derived from it.
    expect(world.savedProjects).toHaveLength(1)
    const saved = world.savedProjects[0]
    if (!saved) throw new Error("no project saved")
    expect(saved.name).toBe("My Demo Project")
    expect(saved.slug).toBe("my-demo-project")
    expect(saved.organizationId).toBe(ORG_ID)

    // Result reflects what's in the row.
    expect(result.projectId).toBe(saved.id)
    expect(result.projectSlug).toBe("my-demo-project")
    // Queue assignee picked from one of the org members.
    const memberIds = org.members.map((m) => m.user.id)
    expect(memberIds).toContain(result.queueAssigneeUserId)

    // Audit event written with the actor + projectId + trimmed name.
    expect(world.outbox).toHaveLength(1)
    const event = world.outbox[0]
    if (!event) throw new Error("no event")
    expect(event.eventName).toBe("AdminDemoProjectSeeded")
    expect(event.aggregateId).toBe(saved.id)
    expect(event.organizationId).toBe("system")
    expect(event.payload).toMatchObject({
      adminUserId: ADMIN_ID,
      organizationId: ORG_ID,
      projectId: saved.id,
      projectName: "My Demo Project",
    })

    // Seed workflow kicked off with the picked assignee + a workflow id
    // namespaced by the new project's id.
    expect(world.workflows).toHaveLength(1)
    const wf = world.workflows[0]
    if (!wf) throw new Error("no workflow")
    expect(wf.name).toBe("seedDemoProjectWorkflow")
    expect(wf.options).toMatchObject({ workflowId: `admin:seed-demo-project:${saved.id}` })
    expect(wf.input).toMatchObject({
      organizationId: ORG_ID,
      projectId: saved.id,
      queueAssigneeUserIds: [result.queueAssigneeUserId],
      apiKeyId: FAKE_API_KEY_ID,
    })
  })

  it("fails with ValidationError when the org has no api keys", async () => {
    // The seeded ClickHouse spans need a real `api_key_id` from the
    // target org so they round-trip through analytics views correctly.
    // Empty-key orgs surface as a degenerate "no default key" state and
    // we fail loud rather than silently writing spans with an empty key.
    const org = mkOrg()
    const { layer, world } = buildLayer(org, null)

    await expect(
      Effect.runPromise(
        createDemoProjectUseCase({
          organizationId: ORG_ID,
          projectName: "Demo",
          actorAdminUserId: ADMIN_ID,
        }).pipe(Effect.provide(layer)),
      ),
    ).rejects.toMatchObject({ _tag: "ValidationError", field: "organizationId" })

    expect(world.savedProjects).toHaveLength(0)
    expect(world.outbox).toHaveLength(0)
    expect(world.workflows).toHaveLength(0)
  })

  it("fails with ConflictError when a project with the same name already exists in the org", async () => {
    const org = mkOrg({ projects: [mkProject("existing-id", "Demo Project")] })
    const { layer, world } = buildLayer(org)

    await expect(
      Effect.runPromise(
        createDemoProjectUseCase({
          organizationId: ORG_ID,
          projectName: "Demo Project",
          actorAdminUserId: ADMIN_ID,
        }).pipe(Effect.provide(layer)),
      ),
    ).rejects.toMatchObject({ _tag: "ConflictError", entity: "Project", value: "Demo Project" })

    // Failure short-circuits — no project saved, no event written.
    expect(world.savedProjects).toHaveLength(0)
    expect(world.outbox).toHaveLength(0)
  })

  it("trims the user-supplied name before the collision check", async () => {
    // The user-typed name has surrounding whitespace; the existing project
    // has the trimmed form. We should still detect the collision.
    const org = mkOrg({ projects: [mkProject("existing-id", "Demo Project")] })
    const { layer } = buildLayer(org)

    await expect(
      Effect.runPromise(
        createDemoProjectUseCase({
          organizationId: ORG_ID,
          projectName: "   Demo Project   ",
          actorAdminUserId: ADMIN_ID,
        }).pipe(Effect.provide(layer)),
      ),
    ).rejects.toMatchObject({ _tag: "ConflictError", entity: "Project" })
  })

  it("fails with ValidationError when project name is empty after trimming", async () => {
    const org = mkOrg()
    const { layer } = buildLayer(org)

    await expect(
      Effect.runPromise(
        createDemoProjectUseCase({
          organizationId: ORG_ID,
          projectName: "    ",
          actorAdminUserId: ADMIN_ID,
        }).pipe(Effect.provide(layer)),
      ),
    ).rejects.toMatchObject({ _tag: "ValidationError", field: "projectName" })
  })

  it("fails with ValidationError when the org has no members", async () => {
    // Without members we'd have nobody to assign queue items to in the
    // seed workflow — surfacing this loudly here beats a confusing
    // workflow failure later.
    const org = mkOrg({ members: [] })
    const { layer, world } = buildLayer(org)

    await expect(
      Effect.runPromise(
        createDemoProjectUseCase({
          organizationId: ORG_ID,
          projectName: "Demo",
          actorAdminUserId: ADMIN_ID,
        }).pipe(Effect.provide(layer)),
      ),
    ).rejects.toMatchObject({ _tag: "ValidationError", field: "organizationId" })

    expect(world.savedProjects).toHaveLength(0)
    expect(world.outbox).toHaveLength(0)
  })

  it("auto-suffixes the slug when it collides with an existing project across the workspace", async () => {
    // Slug uniqueness is enforced cross-org at the DB level, so even if
    // this org's project list is empty, another org may already own
    // `demo-project`. The use-case should append `-1`, `-2`, ... until
    // it finds a free slug.
    const org = mkOrg()
    const { layer, world } = buildLayer(org)
    world.existingSlugs.add("demo-project")
    world.existingSlugs.add("demo-project-1")

    const result = await Effect.runPromise(
      createDemoProjectUseCase({
        organizationId: ORG_ID,
        projectName: "Demo Project",
        actorAdminUserId: ADMIN_ID,
      }).pipe(Effect.provide(layer)),
    )

    expect(result.projectSlug).toBe("demo-project-2")
    const saved = world.savedProjects[0]
    expect(saved?.slug).toBe("demo-project-2")
    // Project name still lands verbatim — only the slug gets the suffix.
    expect(saved?.name).toBe("Demo Project")
  })

  it("returns a result whose projectId matches the saved project", async () => {
    const org = mkOrg()
    const { layer, world } = buildLayer(org)

    const result = await Effect.runPromise(
      createDemoProjectUseCase({
        organizationId: ORG_ID,
        projectName: "Demo",
        actorAdminUserId: ADMIN_ID,
      }).pipe(Effect.provide(layer)),
    )

    const saved = world.savedProjects[0]
    if (!saved) throw new Error("no project saved")
    expect(result.projectId).toBe(saved.id)
    expect(ProjectId(result.projectId)).toBe(saved.id)
  })

  it("treats WorkflowAlreadyStartedError as success — server-fn retries are idempotent", async () => {
    // Scenario: the request handler retried after the project row + outbox
    // event committed but before the response reached the client. The
    // second call still tries to start the workflow; Temporal returns
    // `WorkflowAlreadyStartedError` because a run for this projectId is
    // already going. The use-case must NOT bubble this up as a failure
    // — the caller's intent ("a seed workflow for this project should
    // be running") is already satisfied. Real failures (network /
    // permission) still propagate; only the duplicate-start case
    // recovers.
    const org = mkOrg()
    const { layer, world } = buildLayer(org, FAKE_API_KEY_ID, "already-started")

    const result = await Effect.runPromise(
      createDemoProjectUseCase({
        organizationId: ORG_ID,
        projectName: "Demo",
        actorAdminUserId: ADMIN_ID,
      }).pipe(Effect.provide(layer)),
    )

    const saved = world.savedProjects[0]
    expect(result.projectId).toBe(saved?.id)
    // The starter was still called once — the recovery happens after
    // the failure surfaces, not by short-circuiting the call.
    expect(world.workflows).toHaveLength(1)
  })
})
