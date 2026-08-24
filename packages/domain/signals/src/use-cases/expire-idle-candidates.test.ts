import { OrganizationId, SignalId, SqlClient, type SqlClientShape } from "@domain/shared"
import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import { CANDIDATE_EXPIRY_IDLE_DAYS } from "../constants.ts"
import type { Signal } from "../entities/signal.ts"
import { SignalRepository } from "../ports/signal-repository.ts"
import { createFakeSignalRepository } from "../testing/fake-signal-repository.ts"
import { expireIdleCandidatesUseCase } from "./expire-idle-candidates.ts"

const organizationId = "oooooooooooooooooooooooo"
const projectId = "pppppppppppppppppppppppp"

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000
const daysAgo = (days: number) => new Date(Date.now() - days * MILLISECONDS_PER_DAY)

const makeSignal = ({ id, ...overrides }: Omit<Partial<Signal>, "id"> & { readonly id: string }): Signal => ({
  id: SignalId(id.padEnd(24, "x")),
  organizationId,
  projectId,
  slug: `ACM-${id}`,
  name: "The assistant leaked a token.",
  description: "The assistant leaked a token.",
  source: "flagger",
  origin: "system",
  filters: null,
  assigneeId: null,
  priority: null,
  centroid: null,
  clusteredAt: daysAgo(1),
  promotedAt: null,
  resolvedAt: null,
  ignoredAt: null,
  regressedAt: null,
  mutedAt: null,
  feedback: null,
  deletedAt: null,
  createdAt: daysAgo(1),
  updatedAt: daysAgo(1),
  ...overrides,
})

const passthroughSqlClient = (): SqlClientShape => {
  const sqlClient: SqlClientShape = {
    organizationId: OrganizationId(organizationId),
    transaction: (effect) => effect.pipe(Effect.provideService(SqlClient, sqlClient)),
    query: () => Effect.die("Unexpected direct SQL query in unit test"),
  }
  return sqlClient
}

const run = (seed: readonly Signal[]) => {
  const { repository, issues } = createFakeSignalRepository([...seed])
  return Effect.runPromise(
    expireIdleCandidatesUseCase().pipe(
      Effect.provideService(SignalRepository, repository),
      Effect.provideService(SqlClient, passthroughSqlClient()),
    ),
  ).then((result) => ({ result, issues }))
}

describe("expireIdleCandidatesUseCase", () => {
  it("expires a candidate that stopped accumulating", async () => {
    const idle = makeSignal({ id: "idle", clusteredAt: daysAgo(CANDIDATE_EXPIRY_IDLE_DAYS + 1) })

    const { result, issues } = await run([idle])

    expect(result).toEqual({ expired: 1 })
    expect(issues.get(idle.id)?.deletedAt).not.toBeNull()
  })

  it("leaves candidates still inside the window, and every promoted signal, alone", async () => {
    const recent = makeSignal({ id: "recent", clusteredAt: daysAgo(CANDIDATE_EXPIRY_IDLE_DAYS - 1) })
    // Long dormant, but announced — promoted signals go quiet through resolve or
    // ignore, never by vanishing.
    const promoted = makeSignal({
      id: "promoted",
      clusteredAt: daysAgo(CANDIDATE_EXPIRY_IDLE_DAYS * 10),
      promotedAt: daysAgo(CANDIDATE_EXPIRY_IDLE_DAYS * 10),
    })

    const { result, issues } = await run([recent, promoted])

    expect(result).toEqual({ expired: 0 })
    expect(issues.get(recent.id)?.deletedAt).toBeNull()
    expect(issues.get(promoted.id)?.deletedAt).toBeNull()
  })

  it("falls back to creation time for a candidate that never clustered", async () => {
    const never = makeSignal({
      id: "never",
      centroid: null,
      clusteredAt: null,
      createdAt: daysAgo(CANDIDATE_EXPIRY_IDLE_DAYS + 1),
    })

    const { result, issues } = await run([never])

    expect(result).toEqual({ expired: 1 })
    expect(issues.get(never.id)?.deletedAt).not.toBeNull()
  })
})
