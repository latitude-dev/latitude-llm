import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { AdminSearchRepository } from "./search-repository.ts"
import { emptyUnifiedSearchResult, type UnifiedSearchResult } from "./search-result.ts"
import { unifiedSearchUseCase } from "./unified-search.ts"

const fakeRepo = (result: UnifiedSearchResult) =>
  Layer.succeed(AdminSearchRepository, {
    unifiedSearch: () => Effect.succeed(result),
  })

const mkUser = (email: string, name: string | null = null, createdAt = new Date("2024-01-01")) => ({
  type: "user" as const,
  id: email,
  email,
  name,
  image: null,
  role: "user" as const,
  memberships: [],
  createdAt,
})

const mkOrg = (name: string, id = name, slug = name) => ({
  type: "organization" as const,
  id,
  name,
  slug,
  createdAt: new Date("2024-01-01"),
})

const mkProj = (name: string, id = name, slug = name) => ({
  type: "project" as const,
  id,
  name,
  slug,
  organizationId: "org-1",
  organizationName: "Org 1",
  organizationSlug: "org-1",
  createdAt: new Date("2024-01-01"),
})

describe("unifiedSearchUseCase", () => {
  it("short-circuits with empty result when query is shorter than minimum", async () => {
    const repo = fakeRepo({ users: [mkUser("x@y.com")], organizations: [], projects: [] })

    const result = await Effect.runPromise(
      unifiedSearchUseCase({ query: "a", entityType: "all" }).pipe(Effect.provide(repo)),
    )

    expect(result).toEqual(emptyUnifiedSearchResult())
  })

  it("short-circuits when trimmed query is empty", async () => {
    const repo = fakeRepo({ users: [mkUser("x@y.com")], organizations: [], projects: [] })

    const result = await Effect.runPromise(
      unifiedSearchUseCase({ query: "   ", entityType: "all" }).pipe(Effect.provide(repo)),
    )

    expect(result).toEqual(emptyUnifiedSearchResult())
  })

  it("sorts users by relevance (exact > prefix > contains)", async () => {
    const repo = fakeRepo({
      users: [
        mkUser("contains-lat@foo.com"), // contains
        mkUser("lat"), // exact
        mkUser("lateral@foo.com"), // prefix
      ],
      organizations: [],
      projects: [],
    })

    const result = await Effect.runPromise(
      unifiedSearchUseCase({ query: "lat", entityType: "all" }).pipe(Effect.provide(repo)),
    )

    expect(result.users.map((u) => u.email)).toEqual(["lat", "lateral@foo.com", "contains-lat@foo.com"])
  })

  it("sorts organizations and projects by relevance too", async () => {
    const repo = fakeRepo({
      users: [],
      organizations: [mkOrg("latency-eng"), mkOrg("lat")],
      projects: [mkProj("latency-proj"), mkProj("lat")],
    })

    const result = await Effect.runPromise(
      unifiedSearchUseCase({ query: "lat", entityType: "all" }).pipe(Effect.provide(repo)),
    )

    expect(result.organizations.map((o) => o.name)).toEqual(["lat", "latency-eng"])
    expect(result.projects.map((p) => p.name)).toEqual(["lat", "latency-proj"])
  })

  it("passes through whatever the repo returned for each entity bucket", async () => {
    const repo = fakeRepo({
      users: [mkUser("alice@x.com")],
      organizations: [mkOrg("Alpha")],
      projects: [mkProj("Apex")],
    })

    const result = await Effect.runPromise(
      unifiedSearchUseCase({ query: "al", entityType: "all" }).pipe(Effect.provide(repo)),
    )

    expect(result.users).toHaveLength(1)
    expect(result.organizations).toHaveLength(1)
    expect(result.projects).toHaveLength(1)
  })
})
