import { type Project, ProjectRepository } from "@domain/projects"
import { generateId, NotFoundError, NotificationId, OrganizationId, ProjectId, SqlClient, UserId } from "@domain/shared"
import { createFakeSqlClient } from "@domain/shared/testing"
import { type User, UserRepository } from "@domain/users"
import { createFakeUserRepository } from "@domain/users/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import type { Notification } from "../entities/notification.ts"
import { NotificationRepository } from "../ports/notification-repository.ts"
import { createFakeNotificationRepository } from "../testing/fake-notification-repository.ts"
import {
  type NotificationEmailProject,
  type NotificationEmailRenderer,
  type NotificationEmailSender,
  sendNotificationEmailUseCase,
} from "./send-notification-email.ts"

const cuid = (seed: string) => seed.padEnd(24, "0")

const DEFAULT_PROJECT_SENTINEL = Symbol("default-project")

function setup(opts: { readonly project?: Project | null | typeof DEFAULT_PROJECT_SENTINEL } = {}) {
  const orgId = OrganizationId(cuid("o"))
  const userId = UserId(cuid("u"))
  const projectIdValue = ProjectId(cuid("p"))

  const { repository: userRepo, users } = createFakeUserRepository()
  users.set(userId, {
    id: userId,
    email: "user@test.com",
    name: "Alice",
    jobTitle: null,
    emailVerified: true,
    image: null,
    role: "user",
    notificationPreferences: null,
    createdAt: new Date(),
  } satisfies User)

  const { repo: notificationRepo, rows } = createFakeNotificationRepository()

  // Project repo: only `findById` is exercised by the use case. Other
  // methods die loudly if anything tries to use them. `project` is
  // tri-state — undefined / sentinel = default sample project; null =
  // simulate post-delete (findById fails with NotFoundError); explicit
  // Project = use that one.
  const project: Project | null =
    opts.project === undefined || opts.project === DEFAULT_PROJECT_SENTINEL
      ? ({
          id: projectIdValue,
          organizationId: orgId,
          name: "Sample project",
          slug: "sample-project",
          settings: null,
          firstTraceAt: null,
          deletedAt: null,
          lastEditedAt: new Date("2026-05-01T00:00:00Z"),
          createdAt: new Date("2026-05-01T00:00:00Z"),
          updatedAt: new Date("2026-05-01T00:00:00Z"),
        } satisfies Project)
      : opts.project
  const projectRepo = ProjectRepository.of({
    findById: (id) =>
      project && project.id === id
        ? Effect.succeed(project)
        : Effect.fail(new NotFoundError({ entity: "Project", id })),
    findBySlug: () => Effect.die("not used"),
    list: () => Effect.die("not used"),
    listIncludingDeleted: () => Effect.die("not used"),
    save: () => Effect.die("not used"),
    softDelete: () => Effect.die("not used"),
    hardDelete: () => Effect.die("not used"),
    existsByName: () => Effect.die("not used"),
    countBySlug: () => Effect.die("not used"),
  })

  const sentMessages: { to: string; subject: string; html: string; text?: string }[] = []
  const renderedCalls: { kind: string; payload: Record<string, unknown>; project: NotificationEmailProject | null }[] =
    []

  const renderEmail: NotificationEmailRenderer = ({ kind, payload, project: projectCtx }) =>
    Effect.sync(() => {
      renderedCalls.push({ kind, payload, project: projectCtx })
      return { subject: `[Test] ${kind}`, html: "<p>hi</p>", text: "hi" }
    })

  const sendEmail: NotificationEmailSender = (message) =>
    Effect.sync(() => {
      sentMessages.push(message)
    })

  const layer = Layer.mergeAll(
    Layer.succeed(UserRepository, userRepo),
    Layer.succeed(NotificationRepository, notificationRepo),
    Layer.succeed(ProjectRepository, projectRepo),
    Layer.succeed(SqlClient, createFakeSqlClient({ organizationId: orgId })),
  )

  return {
    orgId,
    userId,
    projectId: projectIdValue,
    rows,
    layer,
    sentMessages,
    renderedCalls,
    renderEmail,
    sendEmail,
  }
}

const makeStoredNotification = (params: {
  readonly userId: Notification["userId"]
  readonly organizationId: Notification["organizationId"]
  readonly projectId?: Notification["projectId"]
}): Notification => ({
  id: NotificationId(generateId()),
  organizationId: params.organizationId,
  userId: params.userId,
  kind: "incident.opened",
  idempotencyKey: `incident.opened:${cuid("ai")}`,
  projectId: params.projectId ?? null,
  payload: { incidentKind: "issue.new", alertIncidentId: cuid("ai") },
  createdAt: new Date(),
  seenAt: null,
  emailedAt: null,
})

describe("sendNotificationEmailUseCase", () => {
  it("claims the row, renders, and sends — and is idempotent on the second call", async () => {
    const ctx = setup()
    const stored = makeStoredNotification({ organizationId: ctx.orgId, userId: ctx.userId })
    await Effect.runPromise(
      Effect.gen(function* () {
        const repo = yield* NotificationRepository
        yield* repo.insertIfAbsent(stored)
      }).pipe(Effect.provide(ctx.layer)),
    )

    const send = sendNotificationEmailUseCase({ renderEmail: ctx.renderEmail, sendEmail: ctx.sendEmail })

    const first = await Effect.runPromise(send({ notificationId: stored.id }).pipe(Effect.provide(ctx.layer)))
    expect(first.sent).toBe(true)
    expect(ctx.sentMessages).toHaveLength(1)
    expect(ctx.sentMessages[0]?.to).toBe("user@test.com")
    expect(ctx.renderedCalls[0]?.kind).toBe("incident.opened")
    // No projectId on the row → renderer gets project: null
    expect(ctx.renderedCalls[0]?.project).toBeNull()

    const second = await Effect.runPromise(send({ notificationId: stored.id }).pipe(Effect.provide(ctx.layer)))
    expect(second.sent).toBe(false)
    // Second run must not have rendered or sent again.
    expect(ctx.sentMessages).toHaveLength(1)
    expect(ctx.renderedCalls).toHaveLength(1)
  })

  it("looks up the project and passes name + slug to the renderer when projectId is set", async () => {
    const ctx = setup()
    const stored = makeStoredNotification({
      organizationId: ctx.orgId,
      userId: ctx.userId,
      projectId: ctx.projectId,
    })
    await Effect.runPromise(
      Effect.gen(function* () {
        const repo = yield* NotificationRepository
        yield* repo.insertIfAbsent(stored)
      }).pipe(Effect.provide(ctx.layer)),
    )

    const send = sendNotificationEmailUseCase({ renderEmail: ctx.renderEmail, sendEmail: ctx.sendEmail })
    await Effect.runPromise(send({ notificationId: stored.id }).pipe(Effect.provide(ctx.layer)))

    expect(ctx.renderedCalls[0]?.project).toEqual({
      id: ctx.projectId,
      name: "Sample project",
      slug: "sample-project",
    })
  })

  it("renders with project: null when the project has been deleted between request and send", async () => {
    const ctx = setup({ project: null })
    const stored = makeStoredNotification({
      organizationId: ctx.orgId,
      userId: ctx.userId,
      projectId: ctx.projectId,
    })
    await Effect.runPromise(
      Effect.gen(function* () {
        const repo = yield* NotificationRepository
        yield* repo.insertIfAbsent(stored)
      }).pipe(Effect.provide(ctx.layer)),
    )

    const send = sendNotificationEmailUseCase({ renderEmail: ctx.renderEmail, sendEmail: ctx.sendEmail })
    const result = await Effect.runPromise(send({ notificationId: stored.id }).pipe(Effect.provide(ctx.layer)))

    expect(result.sent).toBe(true)
    expect(ctx.renderedCalls[0]?.project).toBeNull()
  })

  it("fails with NotFoundError when the row is missing", async () => {
    const ctx = setup()
    const send = sendNotificationEmailUseCase({ renderEmail: ctx.renderEmail, sendEmail: ctx.sendEmail })

    const result = await Effect.runPromiseExit(
      send({ notificationId: NotificationId(generateId()) }).pipe(Effect.provide(ctx.layer)),
    )

    expect(result._tag).toBe("Failure")
  })
})
