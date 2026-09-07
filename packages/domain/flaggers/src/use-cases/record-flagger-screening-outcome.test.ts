import { ChSqlClient, OrganizationId, ProjectId, SessionId } from "@domain/shared"
import { createFakeChSqlClient } from "@domain/shared/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import type { FlaggerScreeningSelection } from "../entities/flagger-screening-decision.ts"
import { FlaggerScreeningDecisionRepository } from "../ports/flagger-screening-decision-repository.ts"
import { createFakeFlaggerScreeningDecisionRepository } from "../testing/fake-flagger-screening-decision-repository.ts"
import { recordFlaggerScreeningOutcomeUseCase } from "./record-flagger-screening-outcome.ts"

const selection: FlaggerScreeningSelection = {
  decisionId: "d".repeat(64),
  organizationId: OrganizationId("o".repeat(24)),
  projectId: ProjectId("p".repeat(24)),
  sessionId: SessionId("session-1"),
  flaggerSlug: "refusal",
  analysisHash: "a".repeat(64),
  scoringArtifactVersion: "flagger-screening-v1",
  selected: true,
  reason: "hinted",
  inclusionProbability: 1,
  hintKinds: ["pattern:refusal"],
  retentionDays: 90,
}

describe("recordFlaggerScreeningOutcomeUseCase", () => {
  it("appends a terminal revision without changing the selection", async () => {
    const { repository, decisions } = createFakeFlaggerScreeningDecisionRepository()
    const layer = Layer.mergeAll(
      Layer.succeed(FlaggerScreeningDecisionRepository, repository),
      Layer.succeed(ChSqlClient, createFakeChSqlClient({ organizationId: selection.organizationId })),
    )

    await Effect.runPromise(
      Effect.gen(function* () {
        yield* recordFlaggerScreeningOutcomeUseCase({ selection, attempt: 1, outcome: "error" })
        yield* recordFlaggerScreeningOutcomeUseCase({ selection, attempt: 3, outcome: "matched" })
      }).pipe(Effect.provide(layer)),
    )

    expect(decisions).toHaveLength(2)
    expect(decisions[0]).toMatchObject({
      ...selection,
      attempt: 1,
      version: 2,
      outcome: "error",
    })
    expect(decisions[1]).toMatchObject({
      ...selection,
      attempt: 3,
      version: 2,
      outcome: "matched",
    })
    expect(decisions[1]?.createdAt).toBeInstanceOf(Date)
  })
})
