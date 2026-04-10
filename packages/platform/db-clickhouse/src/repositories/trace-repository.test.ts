import {
  OrganizationId,
  ProjectId,
  SEED_LIFECYCLE_TRACE_IDS,
  SEED_ORG_ID,
  SEED_PROJECT_ID,
  type TraceId,
} from "@domain/shared/seeding"
import { TraceRepository, type TraceRepositoryShape } from "@domain/spans"
import { setupTestClickHouse } from "@platform/testkit"
import { Effect } from "effect"
import { beforeAll, beforeEach, describe, expect, it } from "vitest"
import { fixedTraceSeeders } from "../seeds/spans/fixed-traces.ts"
import { withClickHouse } from "../with-clickhouse.ts"
import { TraceRepositoryLive } from "./trace-repository.ts"

const ORG_ID = OrganizationId(SEED_ORG_ID)
const PROJECT_ID = ProjectId(SEED_PROJECT_ID)
const TRACE_ID = SEED_LIFECYCLE_TRACE_IDS[0] as TraceId

const ch = setupTestClickHouse()

describe("TraceRepository", () => {
  let repo: TraceRepositoryShape

  beforeAll(async () => {
    repo = await Effect.runPromise(
      Effect.gen(function* () {
        return yield* TraceRepository
      }).pipe(withClickHouse(TraceRepositoryLive, ch.client, ORG_ID)),
    )
  })

  beforeEach(async () => {
    await Effect.runPromise(fixedTraceSeeders[0]!.run({ client: ch.client }))
  })

  describe("matchesFiltersByTraceId", () => {
    it("returns true when the trace matches the canonical filter semantics", async () => {
      const matches = await Effect.runPromise(
        repo.matchesFiltersByTraceId({
          organizationId: ORG_ID,
          projectId: PROJECT_ID,
          traceId: TRACE_ID,
          filters: {
            tags: [{ op: "in", value: ["lifecycle"] }],
          },
        }),
      )

      expect(matches).toBe(true)
    })

    it("returns false when the trace does not match the filters", async () => {
      const matches = await Effect.runPromise(
        repo.matchesFiltersByTraceId({
          organizationId: ORG_ID,
          projectId: PROJECT_ID,
          traceId: TRACE_ID,
          filters: {
            tags: [{ op: "in", value: ["annotation"] }],
          },
        }),
      )

      expect(matches).toBe(false)
    })

    it("returns false for a missing trace id", async () => {
      const matches = await Effect.runPromise(
        repo.matchesFiltersByTraceId({
          organizationId: ORG_ID,
          projectId: PROJECT_ID,
          traceId: "ffffffffffffffffffffffffffffffff" as TraceId,
          filters: {
            tags: [{ op: "in", value: ["lifecycle"] }],
          },
        }),
      )

      expect(matches).toBe(false)
    })
  })
})
