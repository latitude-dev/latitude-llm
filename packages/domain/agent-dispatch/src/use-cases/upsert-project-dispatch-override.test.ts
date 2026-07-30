import { OrganizationId, ProjectId, SqlClient } from "@domain/shared"
import { createFakeSqlClient } from "@domain/shared/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import type { AgentDispatchConfigRow } from "../entities/agent-dispatch-config.ts"
import { AgentDispatchConfigRepository } from "../ports/repositories.ts"
import { upsertProjectDispatchOverrideUseCase } from "./upsert-project-dispatch-override.ts"

const cuid = (seed: string) => seed.padEnd(24, "0")

const orgId = OrganizationId(cuid("o"))
const projectId = ProjectId(cuid("p"))
const integrationId = cuid("i")

const makeLayer = () => {
  const upserted: AgentDispatchConfigRow[] = []

  const configRepository: (typeof AgentDispatchConfigRepository)["Service"] = {
    listByProjectIncludingDefaults: () => Effect.succeed([]),
    findDefaultByIntegration: () => Effect.succeed(null),
    findOverrideByProjectAndIntegration: () => Effect.succeed(null),
    findById: () => Effect.die(new Error("not used")),
    upsert: (config) => {
      upserted.push(config)
      return Effect.succeed(config)
    },
    delete: () => Effect.void,
    deleteByIntegrationId: () => Effect.void,
    countDispatchesInLast24h: () => Effect.succeed(0),
    hasRecentDispatchForSource: () => Effect.succeed(false),
  }

  const layer = Layer.mergeAll(
    Layer.succeed(AgentDispatchConfigRepository, configRepository),
    Layer.succeed(SqlClient, createFakeSqlClient({ organizationId: orgId })),
  )

  return { layer, upserted }
}

describe("upsertProjectDispatchOverrideUseCase", () => {
  it("stores a target with no fields as inherit so it cannot shadow the organization default", async () => {
    const { layer, upserted } = makeLayer()

    await Effect.runPromise(
      upsertProjectDispatchOverrideUseCase({
        organizationId: orgId,
        projectId,
        integrationId,
        kind: "cursor",
        enabled: true,
        triggers: ["signal.discovered"],
        target: {},
      }).pipe(Effect.provide(layer)),
    )

    expect(upserted[0]).toMatchObject({ enabled: true, triggers: ["signal.discovered"], target: null })
  })

  it("keeps a target that carries fields", async () => {
    const { layer, upserted } = makeLayer()

    await Effect.runPromise(
      upsertProjectDispatchOverrideUseCase({
        organizationId: orgId,
        projectId,
        integrationId,
        kind: "cursor",
        target: { repoUrl: "https://github.com/acme/app" },
      }).pipe(Effect.provide(layer)),
    )

    expect(upserted[0]?.target).toEqual({ repoUrl: "https://github.com/acme/app" })
  })
})
