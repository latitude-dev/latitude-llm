import { type Incident, IncidentRepository } from "@domain/incidents"
import { IncidentMonitorReader } from "@domain/notifications"
import { createFakeIncidentMonitorReader } from "@domain/notifications/testing"
import { createOrganization, OrganizationRepository } from "@domain/organizations"
import { createFakeOrganizationRepository } from "@domain/organizations/testing"
import { createProject, ProjectRepository } from "@domain/projects"
import { createFakeProjectRepository } from "@domain/projects/testing"
import { ScoreAnalyticsRepository, ScoreRepository } from "@domain/scores"
import { createFakeScoreAnalyticsRepository, createFakeScoreRepository } from "@domain/scores/testing"
import { AlertIncidentId, OrganizationId, ProjectId, SignalId, SqlClient } from "@domain/shared"
import { createFakeSqlClient } from "@domain/shared/testing"
import { type Signal, SignalRepository } from "@domain/signals"
import { createFakeSignalRepository } from "@domain/signals/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import type { AgentDispatchConfig } from "../entities/agent-dispatch-config.ts"
import { AgentDispatchConfigRepository, AgentDispatchTraceReader } from "../ports/repositories.ts"
import { requestAgentDispatchUseCase } from "./request-agent-dispatch.ts"

const cuid = (seed: string) => seed.padEnd(24, "0")

const orgId = OrganizationId(cuid("o"))
const projectId = ProjectId(cuid("p"))
const signalId = SignalId(cuid("s"))
const configId = cuid("c")
const integrationId = cuid("i")

const now = new Date("2026-06-17T10:00:00.000Z")

const makeSignal = (overrides: Partial<Signal> = {}): Signal => ({
  id: signalId,
  organizationId: orgId,
  projectId,
  slug: "bad-json-output",
  visualId: "LAT-001",
  name: "Bad JSON output",
  description: "The model returns malformed JSON.",
  source: "annotation",
  origin: "system",
  filters: null,
  assigneeId: null,
  priority: null,
  centroid: {
    base: [1, 0],
    mass: 1,
    model: "test",
    decay: 1,
    weights: { annotation: 1, custom: 0, evaluation: 0 },
  },
  clusteredAt: now,
  mutedAt: null,
  createdAt: now,
  updatedAt: now,
  ...overrides,
})

const incidentId = AlertIncidentId(cuid("a"))

const makeConfig = (overrides: Partial<AgentDispatchConfig> = {}): AgentDispatchConfig => ({
  id: configId,
  organizationId: orgId,
  projectId,
  integrationId,
  kind: "webhook",
  enabled: true,
  triggers: ["signal.discovered"],
  target: { webhookUrl: "https://example.com/hook" },
  promptTemplate: null,
  guardrails: { maxDispatchesPerDay: 10, cooldownMinutes: 0 },
  createdAt: now,
  updatedAt: now,
  ...overrides,
})

const makeIncident = (overrides: Partial<Incident> = {}): Incident => ({
  id: incidentId,
  organizationId: orgId,
  projectId,
  sourceType: "signal",
  sourceId: signalId,
  severity: "high",
  startedAt: now,
  endedAt: null,
  createdAt: now,
  entrySignals: {
    expected1h: 1,
    expected6hPerHour: 1,
    stddev1h: 0.5,
    stddev6hPerHour: 0.5,
    kShort: 2,
    kLong: 2,
    entryThreshold1h: 3,
    entryThreshold6hPerHour: 3,
    entryCount24h: 5,
  },
  exitEligibleSince: null,
  condition: null,
  ...overrides,
})

const makeLayer = (opts: { signal: Signal; configs?: readonly AgentDispatchConfig[]; incident?: Incident | null }) => {
  const organization = createOrganization({ id: orgId, name: "Acme", slug: "acme" })
  const project = createProject({ id: projectId, organizationId: orgId, name: "Demo", slug: "demo" })
  const { repository: organizationRepository, organizations } = createFakeOrganizationRepository()
  organizations.set(orgId, organization)
  const { repository: projectRepository } = createFakeProjectRepository([project])
  const { repository: signalRepository } = createFakeSignalRepository([opts.signal])
  const { repository: scoreRepository } = createFakeScoreRepository()
  const { repository: scoreAnalyticsRepository } = createFakeScoreAnalyticsRepository()
  const configs = opts.configs ?? [makeConfig()]

  const configRepository: (typeof AgentDispatchConfigRepository)["Service"] = {
    listEnabledByProject: () => Effect.succeed(configs),
    listByProject: () => Effect.succeed(configs),
    findByProjectAndIntegration: () => Effect.succeed(configs[0] ?? null),
    listByOrganization: () => Effect.succeed(configs),
    findById: (id) => {
      const config = configs.find((row) => row.id === id)
      return config ? Effect.succeed(config) : Effect.die(new Error("config not found"))
    },
    upsert: (config) => Effect.succeed(config),
    delete: () => Effect.void,
    deleteByIntegrationId: () => Effect.void,
    countDispatchesInLast24h: () => Effect.succeed(0),
    hasRecentDispatchForSource: () => Effect.succeed(false),
  }

  const traceReader: (typeof AgentDispatchTraceReader)["Service"] = {
    findMessagesByTraceId: () => Effect.succeed([]),
  }

  const { reader: incidentMonitorReader } = createFakeIncidentMonitorReader()
  const incidentRepository: (typeof IncidentRepository)["Service"] = {
    insert: () => Effect.die("not used"),
    findById: (id) => {
      const incident = opts.incident
      if (incident === null || incident === undefined || incident.id !== id) {
        return Effect.die(new Error("incident not found"))
      }
      return Effect.succeed(incident)
    },
    findOpen: () => Effect.succeed(null),
    closeOpen: () => Effect.succeed(null),
    updateExitDwell: () => Effect.void,
    listByProjectId: () => Effect.die("not used"),
    listOpenBySourceType: () => Effect.die("not used"),
    listByMonitorId: () => Effect.die("not used"),
    statsByMonitorId: () => Effect.die("not used"),
    setEndedAt: () => Effect.die("not used"),
    closeById: () => Effect.die("not used"),
  }

  return Layer.mergeAll(
    Layer.succeed(OrganizationRepository, organizationRepository),
    Layer.succeed(ProjectRepository, projectRepository),
    Layer.succeed(SignalRepository, signalRepository),
    Layer.succeed(ScoreRepository, scoreRepository),
    Layer.succeed(ScoreAnalyticsRepository, scoreAnalyticsRepository),
    Layer.succeed(AgentDispatchConfigRepository, configRepository),
    Layer.succeed(AgentDispatchTraceReader, traceReader),
    Layer.succeed(IncidentRepository, incidentRepository),
    Layer.succeed(IncidentMonitorReader, incidentMonitorReader),
    Layer.succeed(SqlClient, createFakeSqlClient({ organizationId: orgId })),
  )
}

const input = {
  source: {
    type: "signal" as const,
    organizationId: orgId,
    projectId,
    signalId,
  },
  webAppUrl: "https://console.latitude.so",
}

describe("requestAgentDispatchUseCase", () => {
  it("skips signal.discovered dispatches for user-origin signals", async () => {
    const result = await Effect.runPromise(
      requestAgentDispatchUseCase(input).pipe(
        Effect.provide(makeLayer({ signal: makeSignal({ origin: "user", source: "custom" }) })),
      ),
    )

    expect(result).toEqual({ status: "skipped", reason: "user-origin-signal" })
  })

  it("dispatches signal.discovered for system-origin signals", async () => {
    const result = await Effect.runPromise(
      requestAgentDispatchUseCase(input).pipe(Effect.provide(makeLayer({ signal: makeSignal({ origin: "system" }) }))),
    )

    expect(result.status).toBe("ok")
    if (result.status !== "ok") return
    expect(result.requests).toHaveLength(1)
    expect(result.requests[0]?.trigger).toBe("signal.discovered")
    expect(result.requests[0]?.sourceId).toBe(signalId)
  })

  it("dispatches incident.opened for user-origin signals on escalation", async () => {
    const result = await Effect.runPromise(
      requestAgentDispatchUseCase({
        source: {
          type: "incident",
          organizationId: orgId,
          alertIncidentId: incidentId,
        },
        webAppUrl: "https://console.latitude.so",
      }).pipe(
        Effect.provide(
          makeLayer({
            signal: makeSignal({ origin: "user", source: "custom", centroid: null, clusteredAt: null }),
            incident: makeIncident(),
            configs: [makeConfig({ triggers: ["incident.opened"] })],
          }),
        ),
      ),
    )

    expect(result.status).toBe("ok")
    if (result.status !== "ok") return
    expect(result.requests).toHaveLength(1)
    expect(result.requests[0]?.trigger).toBe("incident.opened")
    expect(result.requests[0]?.sourceId).toBe(signalId)
  })
})
