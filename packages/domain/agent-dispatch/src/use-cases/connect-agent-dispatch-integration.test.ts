import { OrganizationId, SqlClient } from "@domain/shared"
import { createFakeSqlClient } from "@domain/shared/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import type { AgentDispatchConfigRow } from "../entities/agent-dispatch-config.ts"
import {
  AgentDispatchConfigRepository,
  AgentDispatchCredentialRepository,
  type AgentDispatchIntegration,
  AgentDispatchIntegrationRepository,
} from "../ports/repositories.ts"
import { connectAgentDispatchIntegrationUseCase } from "./connect-agent-dispatch-integration.ts"

const cuid = (seed: string) => seed.padEnd(24, "0")

const orgId = OrganizationId(cuid("o"))
const integrationId = cuid("i")
const userId = cuid("u")
const now = new Date("2026-07-28T14:42:00.000Z")

const integration: AgentDispatchIntegration = {
  id: integrationId,
  organizationId: orgId,
  kind: "claude_code",
  vendorAccountId: "claude:trig_abc",
  installedByUserId: userId,
  installedAt: now,
  revokedAt: null,
}

const makeLayer = (opts: { existingIntegration?: boolean; existingDefault?: AgentDispatchConfigRow | null } = {}) => {
  const upserted: AgentDispatchConfigRow[] = []

  const integrationRepository: (typeof AgentDispatchIntegrationRepository)["Service"] = {
    findActiveByKind: () =>
      Effect.succeed((opts.existingIntegration ?? Boolean(opts.existingDefault)) ? integration : null),
    install: () => Effect.succeed(integration),
    revoke: () => Effect.void,
  }

  const credentialRepository: (typeof AgentDispatchCredentialRepository)["Service"] = {
    getDecrypted: () =>
      Effect.succeed({ cursorApiKey: null, claudeRoutineToken: null, linearApiKey: null, webhookSecret: null }),
    upsert: () => Effect.void,
    delete: () => Effect.void,
  }

  const configRepository: (typeof AgentDispatchConfigRepository)["Service"] = {
    listByProjectIncludingDefaults: () => Effect.succeed([]),
    findDefaultByIntegration: () => Effect.succeed(opts.existingDefault ?? null),
    findOverrideByProjectAndIntegration: () => Effect.succeed(null),
    countProjectOverrides: () => Effect.succeed(0),
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
    Layer.succeed(AgentDispatchIntegrationRepository, integrationRepository),
    Layer.succeed(AgentDispatchCredentialRepository, credentialRepository),
    Layer.succeed(AgentDispatchConfigRepository, configRepository),
    Layer.succeed(SqlClient, createFakeSqlClient({ organizationId: orgId })),
  )

  return { layer, upserted }
}

const makeDefault = (overrides: Partial<AgentDispatchConfigRow> = {}): AgentDispatchConfigRow => ({
  id: cuid("c"),
  organizationId: orgId,
  projectId: null,
  integrationId,
  kind: "claude_code",
  enabled: false,
  triggers: [],
  target: { routineTriggerId: "trig_old" },
  promptTemplate: null,
  guardrails: null,
  createdAt: now,
  updatedAt: now,
  ...overrides,
})

const connect = (layer: ReturnType<typeof makeLayer>["layer"]) =>
  Effect.runPromise(
    connectAgentDispatchIntegrationUseCase({
      kind: "claude_code",
      vendorAccountId: "claude:trig_abc",
      installedByUserId: userId,
      organizationId: orgId,
      claudeRoutineToken: "token",
      triggers: ["signal.discovered"],
      target: { routineTriggerId: "trig_abc" },
    }).pipe(Effect.provide(layer)),
  )

describe("connectAgentDispatchIntegrationUseCase", () => {
  it("seeds an organization-wide default config so every project can dispatch", async () => {
    const { layer, upserted } = makeLayer()

    await connect(layer)

    expect(upserted).toHaveLength(1)
    expect(upserted[0]).toMatchObject({
      projectId: null,
      integrationId,
      kind: "claude_code",
      enabled: true,
      triggers: ["signal.discovered"],
      target: { routineTriggerId: "trig_abc" },
    })
  })

  it("seeds the default for an integration the backfill left without one", async () => {
    const { layer, upserted } = makeLayer({ existingIntegration: true })

    await connect(layer)

    expect(upserted).toHaveLength(1)
    expect(upserted[0]).toMatchObject({
      projectId: null,
      enabled: true,
      triggers: ["signal.discovered"],
      target: { routineTriggerId: "trig_abc" },
    })
  })

  it("keeps the existing triggers and merges the target when reconnecting", async () => {
    const { layer, upserted } = makeLayer({
      existingDefault: makeDefault({ enabled: true, triggers: ["incident.opened"] }),
    })

    await connect(layer)

    expect(upserted).toHaveLength(1)
    expect(upserted[0]).toMatchObject({
      enabled: true,
      triggers: ["incident.opened"],
      target: { routineTriggerId: "trig_abc" },
    })
  })
})
