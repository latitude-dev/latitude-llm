import { OrganizationId, ProjectId, TraceId } from "@domain/shared"
import { TraceTombstoneRepository, type TraceTombstoneRepositoryShape } from "@domain/spans"
import { setupTestClickHouse } from "@platform/testkit"
import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import { withClickHouse } from "../with-clickhouse.ts"
import { TraceTombstoneRepositoryLive } from "./trace-tombstone-repository.ts"

const organizationId = OrganizationId("o".repeat(24))
const otherOrganizationId = OrganizationId("x".repeat(24))
const projectId = ProjectId("p".repeat(24))
const otherProjectId = ProjectId("q".repeat(24))
const DELETED = TraceId("1".repeat(32))
const LIVE = TraceId("2".repeat(32))

const ch = setupTestClickHouse()

const run = <A, E>(org: OrganizationId, fn: (repo: TraceTombstoneRepositoryShape) => Effect.Effect<A, E>) =>
  Effect.runPromise(
    Effect.gen(function* () {
      return yield* fn(yield* TraceTombstoneRepository)
    }).pipe(withClickHouse(TraceTombstoneRepositoryLive, ch.client, org)),
  )

describe("TraceTombstoneRepositoryLive", () => {
  it("reports only the deleted traces of the same organization and project", async () => {
    await run(organizationId, (repo) => repo.record({ organizationId, projectId, traceIds: [DELETED, DELETED] }))

    const tombstoned = await run(organizationId, (repo) =>
      repo.listTombstoned({
        organizationId,
        candidates: [
          { projectId, traceId: DELETED },
          { projectId, traceId: LIVE },
          { projectId: otherProjectId, traceId: DELETED },
        ],
      }),
    )
    expect([...tombstoned]).toEqual([`${projectId}:${DELETED}`])

    const otherOrg = await run(otherOrganizationId, (repo) =>
      repo.listTombstoned({ organizationId: otherOrganizationId, candidates: [{ projectId, traceId: DELETED }] }),
    )
    expect(otherOrg.size).toBe(0)
  })

  it("ignores malformed trace ids instead of failing the lookup", async () => {
    const tombstoned = await run(organizationId, (repo) =>
      repo.listTombstoned({ organizationId, candidates: [{ projectId, traceId: TraceId("not-a-trace-id") }] }),
    )
    expect(tombstoned.size).toBe(0)
  })
})
