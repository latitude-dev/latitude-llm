import { AgentScoreDigestSource, type AgentScoreSnapshot } from "@domain/agent-score"
import { OrganizationId, SCORE_DIMENSIONS, type ScoreDimension } from "@domain/shared"
import { Effect } from "effect"
import { beforeAll, describe, expect, it } from "vitest"
import { agentScoreSnapshots } from "../schema/agent-score-snapshots.ts"
import { organizations } from "../schema/better-auth.ts"
import { projects } from "../schema/projects.ts"
import { setupTestPostgres } from "../test/in-memory-postgres.ts"
import { withPostgres } from "../with-postgres.ts"
import { AgentScoreDigestSourceLive } from "./agent-score-digest-source.ts"
import { toAgentScoreSnapshotInsertRow } from "./agent-score-snapshot-repository.ts"

const pg = setupTestPostgres()

const makeId = (prefix: string): string => prefix.padEnd(24, "x").slice(0, 24)

const ORG = makeId("org-digest")
const OTHER_ORG = makeId("org-digest-other")
const SANDBOX_ORG = makeId("org-digest-sandbox")

const SCORED = makeId("proj-scored")
const SECOND_SCORED = makeId("proj-second")
const OTHER_ORG_PROJECT = makeId("proj-other-org")
const STALE = makeId("proj-stale")
const DELETED = makeId("proj-deleted")
const SAMPLE = makeId("proj-sample")
const SHOWCASE = makeId("proj-showcase")
const SANDBOX_PROJECT = makeId("proj-sandbox")
const UNSCORED = makeId("proj-unscored")

const WINDOW = { from: "2026-09-16", to: "2026-09-22" }

const dimensions = Object.fromEntries(
  SCORE_DIMENSIONS.map((dimension) => [dimension, { score: 70, interval: { lower: 68, upper: 72 } }]),
) as Record<ScoreDimension, { score: number; interval: { lower: number; upper: number } }>

const snapshot = (organizationId: string, projectId: string, date: string): AgentScoreSnapshot => ({
  organizationId,
  projectId,
  date,
  scoringVersion: "agent-score-v5-provisional",
  windowDays: 7,
  eligibleSessionCount: 120,
  score: 70,
  interval: { lower: 68, upper: 72 },
  dimensions,
  createdAt: new Date(`${date}T04:00:00.000Z`),
})

const listCandidates = (organizationIds?: readonly OrganizationId[]) =>
  Effect.runPromise(
    Effect.gen(function* () {
      const source = yield* AgentScoreDigestSource
      return yield* source.listProjectsWithPublishedScores({ ...WINDOW, organizationIds })
    }).pipe(withPostgres(AgentScoreDigestSourceLive, pg.adminPostgresClient)),
  )

const projectIdsOf = (candidates: Awaited<ReturnType<typeof listCandidates>>) =>
  candidates.map((candidate) => candidate.projectId as string).sort()

describe("AgentScoreDigestSourceLive.listProjectsWithPublishedScores", () => {
  beforeAll(async () => {
    const at = new Date("2026-09-01T00:00:00.000Z")

    await pg.db.insert(organizations).values([
      { id: ORG, name: "Digest Co", slug: "digest-co", createdAt: at, updatedAt: at },
      { id: OTHER_ORG, name: "Other Co", slug: "other-co", createdAt: at, updatedAt: at },
      {
        id: SANDBOX_ORG,
        name: "Sandbox Co",
        slug: "sandbox-co",
        parentOrgId: ORG,
        createdAt: at,
        updatedAt: at,
      },
    ])

    await pg.db.insert(projects).values([
      { id: SCORED, organizationId: ORG, name: "scored", slug: "scored", createdAt: at, updatedAt: at },
      { id: SECOND_SCORED, organizationId: ORG, name: "second", slug: "second", createdAt: at, updatedAt: at },
      { id: UNSCORED, organizationId: ORG, name: "unscored", slug: "unscored", createdAt: at, updatedAt: at },
      { id: STALE, organizationId: ORG, name: "stale", slug: "stale", createdAt: at, updatedAt: at },
      {
        id: DELETED,
        organizationId: ORG,
        name: "deleted",
        slug: "deleted",
        deletedAt: at,
        createdAt: at,
        updatedAt: at,
      },
      {
        id: SAMPLE,
        organizationId: ORG,
        name: "sample",
        slug: "sample",
        settings: { isSample: true },
        createdAt: at,
        updatedAt: at,
      },
      {
        id: SHOWCASE,
        organizationId: ORG,
        name: "showcase",
        slug: "showcase",
        settings: { isShowcase: true },
        createdAt: at,
        updatedAt: at,
      },
      {
        id: OTHER_ORG_PROJECT,
        organizationId: OTHER_ORG,
        name: "other",
        slug: "other",
        createdAt: at,
        updatedAt: at,
      },
      {
        id: SANDBOX_PROJECT,
        organizationId: SANDBOX_ORG,
        name: "sandboxed",
        slug: "sandboxed",
        createdAt: at,
        updatedAt: at,
      },
    ])

    await pg.db.insert(agentScoreSnapshots).values(
      [
        snapshot(ORG, SCORED, "2026-09-17"),
        snapshot(ORG, SCORED, "2026-09-19"),
        snapshot(ORG, SCORED, "2026-09-21"),
        snapshot(ORG, SECOND_SCORED, "2026-09-18"),
        // Newest score predates the window: nothing to report this week.
        snapshot(ORG, STALE, "2026-09-01"),
        snapshot(ORG, DELETED, "2026-09-20"),
        snapshot(ORG, SAMPLE, "2026-09-20"),
        snapshot(ORG, SHOWCASE, "2026-09-20"),
        snapshot(OTHER_ORG, OTHER_ORG_PROJECT, "2026-09-20"),
        snapshot(SANDBOX_ORG, SANDBOX_PROJECT, "2026-09-20"),
      ].map((row, index) => ({ ...toAgentScoreSnapshotInsertRow(row), id: makeId(`snap-${index}`) })),
    )
  })

  it("returns one row per scored project, carrying the newest date it reached", async () => {
    const candidates = await listCandidates([OrganizationId(ORG)])

    expect(projectIdsOf(candidates)).toEqual([SCORED, SECOND_SCORED].sort())
    expect(candidates.find((candidate) => candidate.projectId === SCORED)?.latestDate).toBe("2026-09-21")
    expect(candidates.find((candidate) => candidate.projectId === SECOND_SCORED)?.latestDate).toBe("2026-09-18")
  })

  it("skips a project whose newest score predates the window", async () => {
    const candidates = await listCandidates([OrganizationId(ORG)])

    expect(projectIdsOf(candidates)).not.toContain(STALE)
  })

  it("skips projects with no score at all", async () => {
    const candidates = await listCandidates([OrganizationId(ORG)])

    expect(projectIdsOf(candidates)).not.toContain(UNSCORED)
  })

  it("skips soft-deleted projects, whose snapshots outlive them", async () => {
    const candidates = await listCandidates([OrganizationId(ORG)])

    expect(projectIdsOf(candidates)).not.toContain(DELETED)
  })

  it("skips sample and showcase projects, whose history is seeded", async () => {
    const candidates = await listCandidates([OrganizationId(ORG)])

    expect(projectIdsOf(candidates)).not.toContain(SAMPLE)
    expect(projectIdsOf(candidates)).not.toContain(SHOWCASE)
  })

  it("skips sandbox organizations", async () => {
    const candidates = await listCandidates()

    expect(projectIdsOf(candidates)).not.toContain(SANDBOX_PROJECT)
  })

  it("reads across organizations when no organization filter is given", async () => {
    const candidates = await listCandidates()

    expect(projectIdsOf(candidates)).toEqual([SCORED, SECOND_SCORED, OTHER_ORG_PROJECT].sort())
  })

  it("honours the organization filter a partially enabled flag resolves to", async () => {
    const candidates = await listCandidates([OrganizationId(OTHER_ORG)])

    expect(projectIdsOf(candidates)).toEqual([OTHER_ORG_PROJECT])
  })

  it("queries nothing when the flag is enabled for no organization at all", async () => {
    expect(await listCandidates([])).toEqual([])
  })
})
