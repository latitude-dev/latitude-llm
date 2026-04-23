import { ChSqlClient, deterministicSampling, OrganizationId } from "@domain/shared"
import { createFakeChSqlClient } from "@domain/shared/testing"
import { Effect } from "effect"
import { describe, expect, it, vi } from "vitest"

import { TraceRepository } from "../ports/trace-repository.ts"
import { createFakeTraceRepository } from "../testing/fake-trace-repository.ts"
import { selectTraceEndItemsUseCase } from "./select-trace-end-items.ts"

const INPUT = {
  organizationId: "a".repeat(24),
  projectId: "b".repeat(24),
  traceId: "c".repeat(32),
} as const

describe("selectTraceEndItemsUseCase", () => {
  it("skips sampled-out items before any filter query runs", async () => {
    const listMatchingFilterIdsByTraceId = vi.fn(() => Effect.succeed([]))
    const { repository } = createFakeTraceRepository({
      listMatchingFilterIdsByTraceId,
    })

    const result = await Effect.runPromise(
      selectTraceEndItemsUseCase({
        ...INPUT,
        items: {
          "live-evaluation:eval-1": {
            sampling: 0,
            filter: {
              status: [{ op: "eq", value: "error" }],
            },
          },
        },
      }).pipe(
        Effect.provideService(TraceRepository, repository),
        Effect.provideService(ChSqlClient, createFakeChSqlClient({ organizationId: OrganizationId(INPUT.organizationId) })),
      ),
    )

    expect(result).toEqual({
      "live-evaluation:eval-1": {
        selected: false,
        reason: "sampled-out",
      },
    })
    expect(listMatchingFilterIdsByTraceId).not.toHaveBeenCalled()
  })

  it("treats empty filters as no-op selections without querying ClickHouse", async () => {
    const listMatchingFilterIdsByTraceId = vi.fn(() => Effect.succeed([]))
    const { repository } = createFakeTraceRepository({
      listMatchingFilterIdsByTraceId,
    })

    const result = await Effect.runPromise(
      selectTraceEndItemsUseCase({
        ...INPUT,
        items: {
          "live-evaluation:eval-1": {
            sampling: 100,
            filter: {},
          },
          "live-queue:queue-1": {
            sampling: 100,
            filter: {
              status: [],
            },
          },
          "system-queue:queue-a": {
            sampling: 100,
          },
        },
      }).pipe(
        Effect.provideService(TraceRepository, repository),
        Effect.provideService(ChSqlClient, createFakeChSqlClient({ organizationId: OrganizationId(INPUT.organizationId) })),
      ),
    )

    expect(result).toEqual({
      "live-evaluation:eval-1": {
        selected: true,
        reason: "selected",
      },
      "live-queue:queue-1": {
        selected: true,
        reason: "selected",
      },
      "system-queue:queue-a": {
        selected: true,
        reason: "selected",
      },
    })
    expect(listMatchingFilterIdsByTraceId).not.toHaveBeenCalled()
  })

  it("dedupes identical filters across mixed item types in one query", async () => {
    const listMatchingFilterIdsByTraceId = vi.fn(
      ({ filterSets }: { readonly filterSets: readonly { filterId: string }[] }) =>
        Effect.succeed([filterSets[0]?.filterId].filter((value): value is string => value !== undefined)),
    )
    const { repository } = createFakeTraceRepository({
      listMatchingFilterIdsByTraceId,
    })

    const sharedFilter = {
      tags: [{ op: "contains", value: "support" }],
    } as const

    const result = await Effect.runPromise(
      selectTraceEndItemsUseCase({
        ...INPUT,
        items: {
          "live-evaluation:eval-1": {
            sampling: 100,
            filter: sharedFilter,
            sampleKey: "eval-1",
          },
          "live-queue:queue-1": {
            sampling: 100,
            filter: sharedFilter,
            sampleKey: "queue-1",
          },
          "live-evaluation:eval-2": {
            sampling: 100,
            filter: {
              status: [{ op: "eq", value: "error" }],
            },
            sampleKey: "eval-2",
          },
        },
      }).pipe(
        Effect.provideService(TraceRepository, repository),
        Effect.provideService(ChSqlClient, createFakeChSqlClient({ organizationId: OrganizationId(INPUT.organizationId) })),
      ),
    )

    expect(listMatchingFilterIdsByTraceId).toHaveBeenCalledTimes(1)
    expect(listMatchingFilterIdsByTraceId.mock.calls[0]?.[0].filterSets).toHaveLength(2)
    expect(result).toEqual({
      "live-evaluation:eval-1": {
        selected: true,
        reason: "selected",
      },
      "live-queue:queue-1": {
        selected: true,
        reason: "selected",
      },
      "live-evaluation:eval-2": {
        selected: false,
        reason: "filter-miss",
      },
    })
  })

  it("uses sampleKey when provided to preserve sampling identity", async () => {
    const { repository } = createFakeTraceRepository()
    const sampleKey = "evaluation-id-123"
    const itemKey = `live-evaluation:${sampleKey}`
    const expectedSelected = await deterministicSampling({
      sampling: 1,
      keyParts: [INPUT.organizationId, INPUT.projectId, sampleKey, INPUT.traceId],
    })

    const result = await Effect.runPromise(
      selectTraceEndItemsUseCase({
        ...INPUT,
        items: {
          [itemKey]: {
            sampling: 1,
            sampleKey,
          },
        },
      }).pipe(
        Effect.provideService(TraceRepository, repository),
        Effect.provideService(ChSqlClient, createFakeChSqlClient({ organizationId: OrganizationId(INPUT.organizationId) })),
      ),
    )

    expect(result[itemKey]).toEqual(
      expectedSelected
        ? {
            selected: true,
            reason: "selected",
          }
        : {
            selected: false,
            reason: "sampled-out",
          },
    )
  })
})
