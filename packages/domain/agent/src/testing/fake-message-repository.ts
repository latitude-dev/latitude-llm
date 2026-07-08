import { AgentMessageId, generateId, OrganizationId } from "@domain/shared"
import { Effect } from "effect"
import type { AgentMessageRecord } from "../entities/message.ts"
import type { AgentMessageRepositoryShape } from "../ports/message-repository.ts"

const FAKE_ORG_ID = OrganizationId("fake-org".padEnd(24, "0"))

export const createFakeAgentMessageRepository = (seed: readonly AgentMessageRecord[] = []) => {
  const rows = new Map<string, AgentMessageRecord>(seed.map((row) => [row.id, row]))

  const nextSeq = (sessionId: string): number => {
    let max = -1
    for (const row of rows.values()) {
      if (row.sessionId === sessionId && row.seq > max) max = row.seq
    }
    return max + 1
  }

  const repository: AgentMessageRepositoryShape = {
    append: (args) =>
      Effect.sync(() => {
        const id = args.id ?? AgentMessageId(generateId())
        const entity: AgentMessageRecord = {
          id,
          organizationId: FAKE_ORG_ID,
          sessionId: args.sessionId,
          seq: nextSeq(args.sessionId),
          role: args.role,
          parts: [...args.parts],
          createdAt: new Date(),
        }
        rows.set(id, entity)
        return entity
      }),

    listBySession: (sessionId) =>
      Effect.sync(() => [...rows.values()].filter((row) => row.sessionId === sessionId).sort((a, b) => a.seq - b.seq)),
  }

  return { repository, rows }
}
