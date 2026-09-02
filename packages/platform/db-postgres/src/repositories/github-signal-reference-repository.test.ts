import { GithubSignalReferenceRepository, type GithubSignalReferenceUpsert } from "@domain/github"
import { generateId, OrganizationId, ProjectId, type SqlClient } from "@domain/shared"
import { Effect } from "effect"
import { afterEach, describe, expect, it } from "vitest"
import { githubSignalReferences } from "../schema/github-signal-references.ts"
import { setupTestPostgres } from "../test/in-memory-postgres.ts"
import { withPostgres } from "../with-postgres.ts"
import { GithubSignalReferenceRepositoryLive } from "./github-signal-reference-repository.ts"

const ORG = OrganizationId("a".repeat(24))
const PROJECT = ProjectId("p".repeat(24))
const INTEGRATION = generateId()
const SIGNAL = generateId()

const pg = setupTestPostgres()

const run = <A, E>(effect: Effect.Effect<A, E, GithubSignalReferenceRepository | SqlClient>) =>
  Effect.runPromise(effect.pipe(withPostgres(GithubSignalReferenceRepositoryLive, pg.adminPostgresClient, ORG)))

const prLink = (overrides: Partial<GithubSignalReferenceUpsert> = {}): GithubSignalReferenceUpsert => ({
  organizationId: ORG,
  projectId: PROJECT,
  signalId: SIGNAL,
  integrationId: INTEGRATION,
  repoId: 42,
  repoFullName: "acme/app",
  referenceType: "pull_request",
  prNumber: 7,
  prState: "open",
  commitSha: null,
  pushAfterSha: null,
  title: "Resolves LAT-AB12",
  url: "https://github.com/acme/app/pull/7",
  authorLogin: "octocat",
  matchedSources: ["prTitle"],
  action: "resolve",
  mergedAt: null,
  ...overrides,
})

const commitReference = (overrides: Partial<GithubSignalReferenceUpsert> = {}): GithubSignalReferenceUpsert =>
  prLink({
    referenceType: "commit",
    prNumber: null,
    prState: null,
    commitSha: "c".repeat(40),
    pushAfterSha: "c".repeat(40),
    title: "fix: LAT-AB12",
    url: "https://github.com/acme/app/commit/" + "c".repeat(40),
    matchedSources: ["commitMessage"],
    ...overrides,
  })

afterEach(async () => {
  await pg.db.delete(githubSignalReferences)
})

describe("GithubSignalReferenceRepositoryLive", () => {
  it("upserts a PR reference and updates it in place on the natural key", async () => {
    const { first, second } = await run(
      Effect.gen(function* () {
        const repo = yield* GithubSignalReferenceRepository
        const first = yield* repo.upsert(prLink())
        const second = yield* repo.upsert(
          prLink({ prState: "merged", action: "reference", matchedSources: ["prBody"] }),
        )
        return { first, second }
      }),
    )
    expect(second.id).toBe(first.id)
    expect(second.prState).toBe("merged")
    expect(second.action).toBe("reference")
    expect(second.matchedSources).toEqual(["prBody"])
  })

  it("keeps a PR and a commit reference for the same signal distinct (per-type uniques)", async () => {
    const references = await run(
      Effect.gen(function* () {
        const repo = yield* GithubSignalReferenceRepository
        yield* repo.upsert(prLink())
        yield* repo.upsert(commitReference())
        return yield* repo.listBySignal(SIGNAL)
      }),
    )
    expect(references).toHaveLength(2)
    expect(references.map((l) => l.referenceType).sort()).toEqual(["commit", "pull_request"])
  })

  it("clears actionAppliedAt when upsert changes the stored action", async () => {
    const appliedAt = new Date("2026-06-01T00:00:00.000Z")
    const { kept, cleared } = await run(
      Effect.gen(function* () {
        const repo = yield* GithubSignalReferenceRepository
        const created = yield* repo.upsert(prLink())
        yield* repo.stampActionApplied({ id: created.id, appliedAt })
        const kept = yield* repo.upsert(prLink({ title: "Fixes LAT-AB12 still" }))
        const cleared = yield* repo.upsert(prLink({ action: "unresolve", title: "Reopen LAT-AB12" }))
        return { kept, cleared }
      }),
    )
    expect(kept.action).toBe("resolve")
    expect(kept.actionAppliedAt).toEqual(appliedAt)
    expect(cleared.action).toBe("unresolve")
    expect(cleared.actionAppliedAt).toBeNull()
  })

  it("does not clear an existing merged_at when a later upsert passes null", async () => {
    const merged = new Date("2026-05-01T00:00:00.000Z")
    const after = await run(
      Effect.gen(function* () {
        const repo = yield* GithubSignalReferenceRepository
        yield* repo.upsert(prLink({ mergedAt: merged, prState: "merged" }))
        return yield* repo.upsert(prLink({ mergedAt: null, prState: "merged" }))
      }),
    )
    expect(after.mergedAt).toEqual(merged)
  })

  it("finds absorbable commit references by commit_sha and by push_after_sha", async () => {
    const byCommit = await run(
      Effect.gen(function* () {
        const repo = yield* GithubSignalReferenceRepository
        yield* repo.upsert(commitReference({ commitSha: "d".repeat(40), pushAfterSha: "e".repeat(40) }))
        return yield* repo.findAbsorbableCommitReferences({ repoId: 42, mergeCommitSha: "d".repeat(40), headSha: null })
      }),
    )
    expect(byCommit).toHaveLength(1)

    const byPushAfter = await run(
      Effect.gen(function* () {
        const repo = yield* GithubSignalReferenceRepository
        return yield* repo.findAbsorbableCommitReferences({ repoId: 42, mergeCommitSha: "e".repeat(40), headSha: null })
      }),
    )
    expect(byPushAfter).toHaveLength(1)
  })

  it("bulk-sets pr_state + merged_at across a PR's references and stamps applied actions", async () => {
    const references = await run(
      Effect.gen(function* () {
        const repo = yield* GithubSignalReferenceRepository
        const reference = yield* repo.upsert(prLink())
        yield* repo.setPrState({ repoId: 42, prNumber: 7, prState: "merged", mergedAt: new Date("2026-06-01") })
        yield* repo.stampActionApplied({ id: reference.id, appliedAt: new Date("2026-06-01") })
        return yield* repo.listByPr({ repoId: 42, prNumber: 7 })
      }),
    )
    expect(references).toHaveLength(1)
    expect(references[0]?.prState).toBe("merged")
    expect(references[0]?.actionAppliedAt).not.toBeNull()
  })

  it("deletes by id and by project", async () => {
    const remaining = await run(
      Effect.gen(function* () {
        const repo = yield* GithubSignalReferenceRepository
        const reference = yield* repo.upsert(prLink())
        yield* repo.deleteById(reference.id)
        const afterDelete = yield* repo.listBySignal(SIGNAL)
        yield* repo.upsert(commitReference())
        yield* repo.deleteByProject(PROJECT)
        const afterProjectDelete = yield* repo.listBySignal(SIGNAL)
        return { afterDelete: afterDelete.length, afterProjectDelete: afterProjectDelete.length }
      }),
    )
    expect(remaining.afterDelete).toBe(0)
    expect(remaining.afterProjectDelete).toBe(0)
  })
})
