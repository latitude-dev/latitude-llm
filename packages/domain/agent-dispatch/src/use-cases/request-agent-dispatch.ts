import { hasFeatureFlagUseCase } from "@domain/feature-flags"
import { IncidentRepository } from "@domain/incidents"
import { IncidentMonitorReader } from "@domain/notifications"
import { isSandbox, OrganizationRepository } from "@domain/organizations"
import { type OrganizationId, type ProjectId, SignalId, type SqlClient } from "@domain/shared"
import { SignalRepository } from "@domain/signals"
import { Effect } from "effect"
import { AGENT_DISPATCH_FLAG } from "../constants.ts"
import type { AgentDispatchConfig } from "../entities/agent-dispatch-config.ts"
import type { AgentDispatchContext, AgentDispatchTrigger } from "../entities/agent-dispatch-context.ts"
import {
  buildDispatchContextFromIncident,
  buildDispatchContextFromSignal,
  incidentSourceId,
  incidentSourceType,
  resolveIncidentTrigger,
} from "../helpers/build-dispatch-context.ts"
import { buildDispatchIdempotencyKey } from "../helpers/idempotency-key.ts"
import { renderDispatchPrompt } from "../helpers/render-prompt.ts"
import { AgentDispatchConfigRepository } from "../ports/repositories.ts"

export type AgentDispatchRequestSource =
  | {
      readonly type: "signal"
      readonly organizationId: OrganizationId
      readonly projectId: ProjectId
      readonly signalId: SignalId
    }
  | { readonly type: "incident"; readonly organizationId: OrganizationId; readonly alertIncidentId: string }

export interface AgentDispatchSendRequest {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly configId: string
  readonly integrationId: string
  readonly kind: AgentDispatchConfig["kind"]
  readonly idempotencyKey: string
  readonly trigger: AgentDispatchTrigger
  readonly sourceType: "signal" | "monitor"
  readonly sourceId: string
  readonly prompt: string
  readonly context: AgentDispatchContext
}

export type RequestAgentDispatchResult =
  | { readonly status: "skipped"; readonly reason: string }
  | { readonly status: "ok"; readonly requests: readonly AgentDispatchSendRequest[] }

const passesTriggerGate = (config: AgentDispatchConfig, trigger: AgentDispatchTrigger): boolean =>
  config.triggers.includes(trigger)

const passesGuardrails = (
  config: AgentDispatchConfig,
  checks: { readonly count24h: number; readonly recentForSource: boolean },
): string | null => {
  if (checks.count24h >= config.guardrails.maxDispatchesPerDay) return "max-dispatches-per-day"
  if (checks.recentForSource && config.guardrails.cooldownMinutes > 0) return "cooldown"
  return null
}

const buildSendRequest = (input: {
  readonly config: AgentDispatchConfig
  readonly trigger: AgentDispatchTrigger
  readonly sourceType: "signal" | "monitor"
  readonly sourceId: string
  readonly context: AgentDispatchContext
}): AgentDispatchSendRequest => {
  const idempotencyKey = buildDispatchIdempotencyKey({
    vendor: input.config.kind,
    trigger: input.trigger,
    sourceId: input.sourceId,
  })
  return {
    organizationId: input.config.organizationId,
    projectId: input.config.projectId,
    configId: input.config.id,
    integrationId: input.config.integrationId,
    kind: input.config.kind,
    idempotencyKey,
    trigger: input.trigger,
    sourceType: input.sourceType,
    sourceId: input.sourceId,
    prompt: renderDispatchPrompt({ context: input.context, template: input.config.promptTemplate }),
    context: input.context,
  }
}

export const requestAgentDispatchUseCase = (input: {
  readonly source: AgentDispatchRequestSource
  readonly webAppUrl: string
}) =>
  Effect.gen(function* () {
    const enabled = yield* hasFeatureFlagUseCase({ identifier: AGENT_DISPATCH_FLAG })
    if (!enabled) return { status: "skipped", reason: "feature-disabled" } as const

    const organizations = yield* OrganizationRepository
    const organization = yield* organizations.findById(
      input.source.type === "signal" ? input.source.organizationId : input.source.organizationId,
    )
    if (isSandbox(organization)) return { status: "skipped", reason: "sandbox" } as const

    const configRepo = yield* AgentDispatchConfigRepository
    const incidents = yield* IncidentRepository
    const projectId =
      input.source.type === "signal"
        ? input.source.projectId
        : (yield* incidents.findById(input.source.alertIncidentId as never)).projectId
    const configs = yield* configRepo.listEnabledByProject(projectId)
    if (configs.length === 0) return { status: "skipped", reason: "no-config" } as const

    if (input.source.type === "signal") {
      const signals = yield* SignalRepository
      const signal = yield* signals
        .findById(input.source.signalId)
        .pipe(Effect.catchTag("NotFoundError", () => Effect.succeed(null)))
      if (signal === null || signal.projectId !== input.source.projectId) {
        return { status: "skipped", reason: "signal-not-found" } as const
      }
      if (signal.mutedAt !== null) return { status: "skipped", reason: "signal-muted" } as const

      const context = yield* buildDispatchContextFromSignal({
        organizationId: input.source.organizationId,
        projectId: input.source.projectId,
        signalId: input.source.signalId,
        webAppUrl: input.webAppUrl,
      })

      const requests: AgentDispatchSendRequest[] = []
      for (const config of configs) {
        if (!passesTriggerGate(config, "signal.discovered")) continue
        const guardrailReason = yield* checkGuardrails(config, signal.id)
        if (guardrailReason !== null) continue
        requests.push(
          buildSendRequest({
            config,
            trigger: "signal.discovered",
            sourceType: "signal",
            sourceId: signal.id,
            context,
          }),
        )
      }
      if (requests.length === 0) return { status: "skipped", reason: "no-matching-config" } as const
      return { status: "ok", requests } as const
    }

    const incident = yield* incidents.findById(input.source.alertIncidentId as never)
    const trigger = resolveIncidentTrigger(incident)
    if (trigger === null) return { status: "skipped", reason: "unsupported-source" } as const

    if (incident.sourceType === "monitor") {
      const monitor = yield* (yield* IncidentMonitorReader).findByMonitorId(incident.sourceId)
      if (monitor?.mutedAt !== null && monitor?.mutedAt !== undefined) {
        return { status: "skipped", reason: "monitor-muted" } as const
      }
    }

    if (incident.sourceType === "signal") {
      const signals = yield* SignalRepository
      const signal = yield* signals
        .findById(SignalId(incident.sourceId))
        .pipe(Effect.catchTag("NotFoundError", () => Effect.succeed(null)))
      if (signal?.mutedAt !== null && signal?.mutedAt !== undefined) {
        return { status: "skipped", reason: "signal-muted" } as const
      }
    }

    const context = yield* buildDispatchContextFromIncident({ incident, trigger, webAppUrl: input.webAppUrl })
    const sourceId = incidentSourceId(incident)
    const sourceType = incidentSourceType(incident)

    const requests: AgentDispatchSendRequest[] = []
    for (const config of configs) {
      if (!passesTriggerGate(config, trigger)) continue
      const guardrailReason = yield* checkGuardrails(config, sourceId)
      if (guardrailReason !== null) continue
      requests.push(
        buildSendRequest({
          config,
          trigger,
          sourceType,
          sourceId,
          context,
        }),
      )
    }
    if (requests.length === 0) return { status: "skipped", reason: "no-matching-config" } as const
    return { status: "ok", requests } as const
  }).pipe(Effect.withSpan("agentDispatch.request")) as Effect.Effect<
    RequestAgentDispatchResult,
    unknown,
    | SqlClient
    | AgentDispatchConfigRepository
    | IncidentRepository
    | IncidentMonitorReader
    | SignalRepository
    | OrganizationRepository
  >

const checkGuardrails = (
  config: AgentDispatchConfig,
  sourceId: string,
): Effect.Effect<string | null, unknown, AgentDispatchConfigRepository | SqlClient> =>
  Effect.gen(function* () {
    const configRepo = yield* AgentDispatchConfigRepository
    const [count24h, recentForSource] = yield* Effect.all([
      configRepo.countDispatchesInLast24h(config.id),
      configRepo.hasRecentDispatchForSource({
        configId: config.id,
        sourceId,
        cooldownMinutes: config.guardrails.cooldownMinutes,
      }),
    ])
    return passesGuardrails(config, { count24h, recentForSource })
  })
