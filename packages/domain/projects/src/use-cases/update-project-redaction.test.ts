import { OutboxEventWriter, type OutboxWriteEvent } from "@domain/events"
import { OrganizationId, ProjectId, type RedactionSetting, SqlClient } from "@domain/shared"
import { createFakeSqlClient } from "@domain/shared/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { createProject, type Project } from "../entities/project.ts"
import { ProjectRepository } from "../ports/project-repository.ts"
import { createFakeProjectRepository } from "../testing/fake-project-repository.ts"
import { updateProjectRedactionUseCase } from "./update-project-redaction.ts"

const ORG_ID = OrganizationId("o".repeat(24))
const PROJECT_ID = ProjectId("1".repeat(24))
const ACTOR = "u".repeat(24)

const ENFORCE: RedactionSetting = {
  mode: "enforce",
  entities: ["email", "phone"],
  scopes: { metadata: true },
  identities: "pseudonymize",
}

const makeProject = (settings: Project["settings"]): Project => ({
  ...createProject({ organizationId: ORG_ID, id: PROJECT_ID, slug: "checkout-agent", name: "Checkout agent" }),
  settings,
})

const run = (seed: Project, redaction: RedactionSetting | null) => {
  const { repository, rows } = createFakeProjectRepository([seed])
  const written: OutboxWriteEvent[] = []
  const layer = Layer.mergeAll(
    Layer.succeed(ProjectRepository, repository),
    Layer.succeed(SqlClient, createFakeSqlClient({ organizationId: ORG_ID })),
    Layer.succeed(OutboxEventWriter, {
      write: (event) => {
        written.push(event)
        return Effect.void
      },
    }),
  )
  return Effect.runPromise(
    updateProjectRedactionUseCase({ projectId: PROJECT_ID, actorUserId: ACTOR, redaction }).pipe(Effect.provide(layer)),
  ).then((updated) => ({ updated, rows, written }))
}

describe("updateProjectRedactionUseCase", () => {
  it("sets the policy and leaves every sibling setting alone", async () => {
    const { rows } = await run(makeProject({ sampling: { enabled: true, rate: 0.5 }, isShowcase: true }), ENFORCE)

    expect(rows.get(PROJECT_ID)?.settings).toEqual({
      sampling: { enabled: true, rate: 0.5 },
      isShowcase: true,
      redaction: ENFORCE,
    })
  })

  it("removes the override when given null, without disturbing siblings", async () => {
    const { rows } = await run(makeProject({ redaction: ENFORCE, keepMonitoring: false }), null)

    expect(rows.get(PROJECT_ID)?.settings).toEqual({ keepMonitoring: false })
  })

  it("records the transition as an audit event", async () => {
    const { written } = await run(makeProject({ redaction: { mode: "off" } }), ENFORCE)

    expect(written).toHaveLength(1)
    expect(written[0]?.eventName).toBe("ProjectRedactionPolicyChanged")
    expect(written[0]?.payload).toEqual({
      organizationId: ORG_ID,
      actorUserId: ACTOR,
      projectId: PROJECT_ID,
      fromRedaction: { mode: "off" },
      toRedaction: ENFORCE,
    })
  })

  // An audit trail full of "changed from X to X" entries is worse than no trail:
  // it buries the changes that mattered.
  it("emits nothing and writes nothing when the policy is unchanged", async () => {
    const { rows, written } = await run(makeProject({ redaction: ENFORCE }), { ...ENFORCE })

    expect(written).toHaveLength(0)
    expect(rows.get(PROJECT_ID)?.settings?.redaction).toEqual(ENFORCE)
  })

  it("treats a reordered entity list as unchanged, since order is a UI artifact", async () => {
    const { written } = await run(makeProject({ redaction: ENFORCE }), {
      ...ENFORCE,
      entities: ["phone", "email"],
    })

    expect(written).toHaveLength(0)
  })

  it("treats null and an absent policy as the same starting point", async () => {
    const { written } = await run(makeProject(null), null)

    expect(written).toHaveLength(0)
  })

  it("fails with ProjectNotFoundError for an unknown project", async () => {
    const { repository } = createFakeProjectRepository([])
    const layer = Layer.mergeAll(
      Layer.succeed(ProjectRepository, repository),
      Layer.succeed(SqlClient, createFakeSqlClient({ organizationId: ORG_ID })),
      Layer.succeed(OutboxEventWriter, { write: () => Effect.void }),
    )

    const error = await Effect.runPromise(
      updateProjectRedactionUseCase({ projectId: PROJECT_ID, actorUserId: ACTOR, redaction: ENFORCE }).pipe(
        Effect.provide(layer),
        Effect.flip,
      ),
    )

    expect(error._tag).toBe("ProjectNotFoundError")
  })
})
