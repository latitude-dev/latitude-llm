import { AgentSessionId, generateId, OrganizationId } from "@domain/shared"
import { Effect } from "effect"
import type { AgentSession } from "../entities/session.ts"
import { AgentSessionNotFoundError } from "../errors.ts"
import type { AgentSessionRepositoryShape } from "../ports/session-repository.ts"

const FAKE_ORG_ID = OrganizationId("fake-org".padEnd(24, "0"))

export const createFakeAgentSessionRepository = (seed: readonly AgentSession[] = []) => {
  const rows = new Map<string, AgentSession>(seed.map((row) => [row.id, row]))

  const repository: AgentSessionRepositoryShape = {
    create: (args) =>
      Effect.sync(() => {
        const now = new Date()
        const id = args.id ?? AgentSessionId(generateId())
        const entity: AgentSession = {
          id,
          organizationId: FAKE_ORG_ID,
          userId: args.userId,
          projectId: args.projectId,
          title: args.title ?? null,
          createdAt: now,
          updatedAt: now,
        }
        rows.set(id, entity)
        return entity
      }),

    findById: (id) =>
      Effect.gen(function* () {
        const row = rows.get(id)
        if (!row) return yield* new AgentSessionNotFoundError({ sessionId: id })
        return row
      }),

    touch: (id) =>
      Effect.gen(function* () {
        const row = rows.get(id)
        if (!row) return yield* new AgentSessionNotFoundError({ sessionId: id })
        rows.set(id, { ...row, updatedAt: new Date() })
      }),

    listByUser: ({ userId, limit }) =>
      Effect.sync(() =>
        [...rows.values()]
          .filter((row) => row.userId === userId)
          .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
          .slice(0, limit),
      ),
  }

  return { repository, rows }
}
