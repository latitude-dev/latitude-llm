import { AgentDispatchRepository } from "@domain/agent-dispatch"
import { generateId, OrganizationId, ProjectId, type SqlClient } from "@domain/shared"
import { Effect } from "effect"
import { afterEach, describe, expect, it } from "vitest"
import { agentDispatches } from "../schema/agent-dispatches.ts"
import { setupTestPostgres } from "../test/in-memory-postgres.ts"
import { withPostgres } from "../with-postgres.ts"
import { AgentDispatchRepositoryLive } from "./agent-dispatch-repository.ts"

const ORG = OrganizationId("a".repeat(24))
const PROJECT = ProjectId("b".repeat(24))
const CONFIG = generateId()

const pg = setupTestPostgres()

const run = <A, E>(effect: Effect.Effect<A, E, AgentDispatchRepository | SqlClient>) =>
  Effect.runPromise(effect.pipe(withPostgres(AgentDispatchRepositoryLive, pg.adminPostgresClient, ORG)))

afterEach(async () => {
  await pg.db.delete(agentDispatches)
})

describe("AgentDispatchRepositoryLive", () => {
  it("allows transport retry while claimed and blocks after dispatch", async () => {
    const input = {
      configId: CONFIG,
      projectId: PROJECT,
      idempotencyKey: "webhook:incident.opened:src1",
      trigger: "incident.opened" as const,
      sourceType: "signal" as const,
      sourceId: "sig1",
    }

    const first = await run(
      Effect.gen(function* () {
        const repo = yield* AgentDispatchRepository
        return yield* repo.claim(input)
      }),
    )
    const retry = await run(
      Effect.gen(function* () {
        const repo = yield* AgentDispatchRepository
        return yield* repo.claim(input)
      }),
    )

    expect(first.claimed).toBe(true)
    expect(retry.claimed).toBe(true)
    expect(retry.dispatchId).toBe(first.dispatchId)

    if (first.dispatchId === null) throw new Error("unreachable")
    await run(
      Effect.gen(function* () {
        const repo = yield* AgentDispatchRepository
        if (first.dispatchId === null) throw new Error("unreachable")
        return yield* repo.markDispatched({ dispatchId: first.dispatchId })
      }),
    )

    const afterDispatch = await run(
      Effect.gen(function* () {
        const repo = yield* AgentDispatchRepository
        return yield* repo.claim(input)
      }),
    )
    expect(afterDispatch.claimed).toBe(false)
  })

  it("lists dispatches for a single source newest-first, scoped to project and source", async () => {
    const claim = (idempotencyKey: string, sourceId: string, projectId = PROJECT) =>
      run(
        Effect.gen(function* () {
          const repo = yield* AgentDispatchRepository
          return yield* repo.claim({
            configId: CONFIG,
            projectId,
            idempotencyKey,
            trigger: "manual" as const,
            sourceType: "signal" as const,
            sourceId,
          })
        }),
      )

    await claim("cursor:cfg:manual:sigA:1", "sigA")
    await claim("linear:cfg:manual:sigA:2", "sigA")
    await claim("cursor:cfg:manual:sigB:1", "sigB")
    await claim("cursor:cfg:manual:sigA:1", "sigA", ProjectId("c".repeat(24)))

    const forSignalA = await run(
      Effect.gen(function* () {
        const repo = yield* AgentDispatchRepository
        return yield* repo.listBySource({ projectId: PROJECT, sourceType: "signal", sourceId: "sigA" })
      }),
    )

    expect(forSignalA).toHaveLength(2)
    expect(forSignalA.every((dispatch) => dispatch.sourceId === "sigA")).toBe(true)
    expect(forSignalA.every((dispatch) => dispatch.projectId === PROJECT)).toBe(true)
    const [newest, oldest] = forSignalA
    if (!newest || !oldest) throw new Error("unreachable")
    expect(newest.claimedAt.getTime()).toBeGreaterThanOrEqual(oldest.claimedAt.getTime())
  })

  it("marks claimed rows failed by idempotency key", async () => {
    const input = {
      configId: CONFIG,
      projectId: PROJECT,
      idempotencyKey: "cursor:incident.opened:src2",
      trigger: "incident.opened" as const,
      sourceType: "signal" as const,
      sourceId: "sig2",
    }

    const claim = await run(
      Effect.gen(function* () {
        const repo = yield* AgentDispatchRepository
        return yield* repo.claim(input)
      }),
    )
    expect(claim.claimed).toBe(true)

    const marked = await run(
      Effect.gen(function* () {
        const repo = yield* AgentDispatchRepository
        return yield* repo.markFailedByIdempotencyKey({
          idempotencyKey: input.idempotencyKey,
          errorCategory: "transport",
          errorDetail: "upstream 503",
        })
      }),
    )
    expect(marked).toBe(true)

    const retry = await run(
      Effect.gen(function* () {
        const repo = yield* AgentDispatchRepository
        return yield* repo.claim(input)
      }),
    )
    expect(retry.claimed).toBe(false)
    expect(retry.dispatchId).toBe(null)
  })
})
