import { ScoreEventWriter } from "@domain/scores"
import { generateId, type ScoreId, SqlClient, type SqlClientShape } from "@domain/shared"
import { Effect, Layer } from "effect"
import type { Operator } from "../client.ts"
import { outboxEvents } from "../schema/outbox-events.ts"

export const ScoreEventWriterLive = Layer.effect(
  ScoreEventWriter,
  Effect.gen(function* () {
    const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>

    return {
      scoreImmutable: ({
        organizationId: payloadOrganizationId,
        projectId,
        scoreId,
        issueId,
      }: {
        readonly organizationId: string
        readonly projectId: string
        readonly scoreId: ScoreId
        readonly issueId: string | null
      }) =>
        sqlClient.query((db, organizationId) =>
          db.insert(outboxEvents).values({
            id: generateId(),
            eventName: "ScoreImmutable",
            aggregateId: scoreId,
            organizationId,
            payload: { organizationId: payloadOrganizationId, projectId, scoreId, issueId },
            occurredAt: new Date(),
          }),
        ),
    }
  }),
)
