import { AgentDispatchConfigRepository, type AgentDispatchConfigRow } from "@domain/agent-dispatch"
import { generateId, OrganizationId, ProjectId, type SqlClient } from "@domain/shared"
import { Effect } from "effect"
import { afterEach, describe, expect, it } from "vitest"
import { agentDispatchConfigs } from "../schema/agent-dispatch-configs.ts"
import { agentDispatches } from "../schema/agent-dispatches.ts"
import { setupTestPostgres } from "../test/in-memory-postgres.ts"
import { withPostgres } from "../with-postgres.ts"
import { AgentDispatchConfigRepositoryLive } from "./agent-dispatch-config-repository.ts"

const ORG = OrganizationId("a".repeat(24))
const PROJECT_A = ProjectId("b".repeat(24))
const PROJECT_B = ProjectId("c".repeat(24))
const INTEGRATION = generateId()

const pg = setupTestPostgres()

const run = <A, E>(effect: Effect.Effect<A, E, AgentDispatchConfigRepository | SqlClient>) =>
  Effect.runPromise(effect.pipe(withPostgres(AgentDispatchConfigRepositoryLive, pg.adminPostgresClient, ORG)))

const now = new Date("2026-07-09T00:00:00.000Z")

const row = (overrides: Partial<AgentDispatchConfigRow>): AgentDispatchConfigRow => ({
  id: generateId(),
  organizationId: ORG,
  projectId: null,
  integrationId: INTEGRATION,
  kind: "webhook",
  enabled: true,
  triggers: ["signal.discovered"],
  target: { webhookUrl: "https://example.com/hook" },
  promptTemplate: null,
  guardrails: { maxDispatchesPerDay: 5, cooldownMinutes: 30 },
  createdAt: now,
  updatedAt: now,
  ...overrides,
})

afterEach(async () => {
  await pg.db.delete(agentDispatches)
  await pg.db.delete(agentDispatchConfigs)
})

describe("AgentDispatchConfigRepositoryLive", () => {
  it("round-trips a default row with null overridable fields", async () => {
    const created = await run(
      Effect.gen(function* () {
        const repo = yield* AgentDispatchConfigRepository
        return yield* repo.upsert(row({ enabled: null, triggers: null, target: null, guardrails: null }))
      }),
    )
    expect(created.projectId).toBeNull()

    const found = await run(
      Effect.gen(function* () {
        const repo = yield* AgentDispatchConfigRepository
        return yield* repo.findDefaultByIntegration(INTEGRATION)
      }),
    )
    expect(found?.enabled).toBeNull()
    expect(found?.triggers).toBeNull()
    expect(found?.target).toBeNull()
    expect(found?.guardrails).toBeNull()
  })

  it("lists the default and every project override of one kind", async () => {
    const OTHER_INTEGRATION = generateId()
    await run(
      Effect.gen(function* () {
        const repo = yield* AgentDispatchConfigRepository
        yield* repo.upsert(row({}))
        yield* repo.upsert(row({ projectId: PROJECT_A }))
        yield* repo.upsert(row({ projectId: PROJECT_B }))
        yield* repo.upsert(row({ kind: "cursor", integrationId: OTHER_INTEGRATION }))
      }),
    )

    const webhookConfigs = await run(
      Effect.gen(function* () {
        const repo = yield* AgentDispatchConfigRepository
        return yield* repo.listByKind("webhook")
      }),
    )

    expect(webhookConfigs).toHaveLength(3)
    expect(new Set(webhookConfigs.map((config) => config.projectId))).toEqual(new Set([null, PROJECT_A, PROJECT_B]))
  })

  it("enforces one default per integration", async () => {
    await run(
      Effect.gen(function* () {
        const repo = yield* AgentDispatchConfigRepository
        yield* repo.upsert(row({}))
      }),
    )
    await expect(
      run(
        Effect.gen(function* () {
          const repo = yield* AgentDispatchConfigRepository
          yield* repo.upsert(row({}))
        }),
      ),
    ).rejects.toThrow()
  })

  it("enforces one override per project and integration", async () => {
    await run(
      Effect.gen(function* () {
        const repo = yield* AgentDispatchConfigRepository
        yield* repo.upsert(row({ projectId: PROJECT_A }))
      }),
    )
    await expect(
      run(
        Effect.gen(function* () {
          const repo = yield* AgentDispatchConfigRepository
          yield* repo.upsert(row({ projectId: PROJECT_A }))
        }),
      ),
    ).rejects.toThrow()
  })

  it("returns defaults plus the project's own override, not other projects' overrides", async () => {
    await run(
      Effect.gen(function* () {
        const repo = yield* AgentDispatchConfigRepository
        yield* repo.upsert(row({ id: generateId(), projectId: null }))
        yield* repo.upsert(row({ id: generateId(), projectId: PROJECT_A }))
        yield* repo.upsert(row({ id: generateId(), projectId: PROJECT_B }))
      }),
    )
    const rows = await run(
      Effect.gen(function* () {
        const repo = yield* AgentDispatchConfigRepository
        return yield* repo.listByProjectIncludingDefaults(PROJECT_A)
      }),
    )
    const projectIds = rows.map((r) => r.projectId)
    expect(rows).toHaveLength(2)
    expect(projectIds).toContain(null)
    expect(projectIds).toContain(PROJECT_A)
    expect(projectIds).not.toContain(PROJECT_B)
  })

  it("counts dispatches per project so a shared config's budget does not bleed across projects", async () => {
    const configId = generateId()
    await run(
      Effect.gen(function* () {
        const repo = yield* AgentDispatchConfigRepository
        yield* repo.upsert(row({ id: configId, projectId: null }))
      }),
    )
    await pg.db.insert(agentDispatches).values([
      {
        id: generateId(),
        organizationId: ORG,
        projectId: PROJECT_A,
        configId,
        idempotencyKey: generateId(),
        trigger: "signal.discovered",
        sourceType: "signal",
        sourceId: "sig-a",
        status: "dispatched",
      },
      {
        id: generateId(),
        organizationId: ORG,
        projectId: PROJECT_B,
        configId,
        idempotencyKey: generateId(),
        trigger: "signal.discovered",
        sourceType: "signal",
        sourceId: "sig-b",
        status: "dispatched",
      },
    ])

    const [countA, countB] = await run(
      Effect.gen(function* () {
        const repo = yield* AgentDispatchConfigRepository
        return yield* Effect.all([
          repo.countDispatchesInLast24h({ configId, projectId: PROJECT_A }),
          repo.countDispatchesInLast24h({ configId, projectId: PROJECT_B }),
        ])
      }),
    )
    expect(countA).toBe(1)
    expect(countB).toBe(1)
  })
})
