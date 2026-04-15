import {
  ISSUE_DISCOVERY_MAX_CANDIDATES,
  ISSUE_DISCOVERY_MIN_KEYWORDS,
  ISSUE_DISCOVERY_MIN_SIMILARITY,
  ISSUE_DISCOVERY_SEARCH_RATIO,
  IssueProjectionRepository,
} from "@domain/issues"
import { OrganizationId } from "@domain/shared"
import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import { Bm25Operator, type WeaviateClient } from "weaviate-client"
import { issuesCollectionTenantName } from "../collections.ts"
import { withWeaviate } from "../with-weaviate.ts"
import { IssueProjectionRepositoryLive } from "./issue-projection-repository.ts"

type HybridObject = {
  uuid: string
  properties: {
    title: string
    description: string
  }
  metadata?: {
    score?: number
  }
}

function createWeaviateClientStub({
  tenantExists = true,
  hybridObjects = [],
}: {
  readonly tenantExists?: boolean
  readonly hybridObjects?: readonly HybridObject[]
}) {
  let existingTenant = tenantExists
  const createdTenants: string[] = []
  const withTenantCalls: string[] = []
  const insertCalls: unknown[] = []
  const replaceCalls: unknown[] = []
  const hybridCalls: Array<{ query: string; options: unknown }> = []
  const existingIds = new Set<string>()

  const tenantCollection = {
    data: {
      exists: async (id: string) => existingIds.has(id),
      insert: async (payload: unknown) => {
        insertCalls.push(payload)
        const entry = payload as { id: string }
        existingIds.add(entry.id)
      },
      replace: async (payload: unknown) => {
        replaceCalls.push(payload)
        const entry = payload as { id: string }
        existingIds.add(entry.id)
      },
      deleteById: async (id: string) => {
        existingIds.delete(id)
      },
    },
    query: {
      hybrid: async (query: string, options: unknown) => {
        hybridCalls.push({ query, options })
        return { objects: hybridObjects }
      },
    },
    length: async () => existingIds.size,
    tenants: {
      remove: async (_tenantName: string) => {
        existingTenant = false
      },
    },
  }

  const collection = {
    tenants: {
      getByName: async (_tenantName: string) => (existingTenant ? { name: "existing" } : null),
      create: async (tenants: Array<{ name: string }>) => {
        createdTenants.push(...tenants.map((tenant) => tenant.name))
        existingTenant = true
      },
    },
    withTenant: (tenantName: string) => {
      withTenantCalls.push(tenantName)
      return tenantCollection
    },
  }

  return {
    client: {
      collections: {
        get: () => collection,
      },
    } as unknown as WeaviateClient,
    createdTenants,
    hybridCalls,
    insertCalls,
    replaceCalls,
    withTenantCalls,
  }
}

const runWithRepository = <A>(
  client: WeaviateClient,
  effectFactory: (repository: typeof IssueProjectionRepository.Service) => Effect.Effect<A, never | Error, never>,
) =>
  Effect.runPromise(
    Effect.gen(function* () {
      const repository = yield* IssueProjectionRepository
      return yield* effectFactory(repository)
    }).pipe(withWeaviate(IssueProjectionRepositoryLive, client, OrganizationId("org-1"))),
  )

describe("IssueProjectionRepositoryLive", () => {
  it("builds project-scoped Weaviate tenant names with underscores", () => {
    expect(
      issuesCollectionTenantName({
        organizationId: "org-1",
        projectId: "proj-1",
      }),
    ).toBe("org-1_proj-1")
  })

  it("creates the tenant on upsert write paths", async () => {
    const state = createWeaviateClientStub({ tenantExists: false })

    await runWithRepository(state.client, (repository) =>
      repository.upsert({
        projectId: "proj-1",
        uuid: "issue-1",
        title: "Token leakage",
        description: "Agent exposed API tokens",
        vector: [1, 0],
      }),
    )

    expect(state.createdTenants).toEqual(["org-1_proj-1"])
    expect(state.withTenantCalls).toEqual(["org-1_proj-1"])
    expect(state.insertCalls).toHaveLength(1)
  })

  it("creates the tenant on search paths before querying Weaviate", async () => {
    const state = createWeaviateClientStub({ tenantExists: false })

    const results = await runWithRepository(state.client, (repository) =>
      repository.hybridSearch({
        projectId: "proj-1",
        query: "token leakage",
        vector: [1, 0],
      }),
    )

    expect(results).toEqual([])
    expect(state.createdTenants).toEqual(["org-1_proj-1"])
    expect(state.withTenantCalls).toEqual(["org-1_proj-1"])
    expect(state.hybridCalls).toHaveLength(1)
  })

  it("uses Weaviate hybrid search with RelativeScore fusion and BM25", async () => {
    const state = createWeaviateClientStub({
      tenantExists: true,
      hybridObjects: [
        {
          uuid: "issue-1",
          properties: {
            title: "Token leakage",
            description: "Agent exposed API tokens",
          },
          metadata: {
            score: 0.91,
          },
        },
      ],
    })

    const results = await runWithRepository(state.client, (repository) =>
      repository.hybridSearch({
        projectId: "proj-1",
        query: "token leakage",
        vector: [1, 0],
      }),
    )

    expect(state.withTenantCalls).toEqual(["org-1_proj-1"])
    expect(state.hybridCalls).toHaveLength(1)
    expect(state.hybridCalls[0]).toMatchObject({
      query: "token leakage",
      options: {
        vector: [1, 0],
        alpha: ISSUE_DISCOVERY_SEARCH_RATIO,
        maxVectorDistance: 1 - ISSUE_DISCOVERY_MIN_SIMILARITY,
        fusionType: "RelativeScore",
        limit: ISSUE_DISCOVERY_MAX_CANDIDATES,
        returnProperties: ["title", "description"],
        returnMetadata: ["score"],
      },
    })
    expect((state.hybridCalls[0]?.options as { bm25Operator?: unknown }).bm25Operator).toEqual(
      Bm25Operator.or({
        minimumMatch: ISSUE_DISCOVERY_MIN_KEYWORDS,
      }),
    )
    expect(results).toEqual([
      {
        uuid: "issue-1",
        title: "Token leakage",
        description: "Agent exposed API tokens",
        score: 0.91,
      },
    ])
  })
})
