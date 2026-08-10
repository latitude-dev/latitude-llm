import { IncidentRepository } from "@domain/incidents"
import { IncidentMonitorReader } from "@domain/notifications"
import { isSandbox, OrganizationRepository } from "@domain/organizations"
import { AlertIncidentId, type OrganizationId, type ProjectId, SignalId, type SqlClient } from "@domain/shared"
import { SignalRepository } from "@domain/signals"
import { Effect } from "effect"
import type {
  AgentDispatchKind,
  EffectiveAgentDispatchConfig,
  ResolvedDispatchTarget,
} from "../entities/agent-dispatch-config.ts"
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
import { checkTargetReadiness, resolveEffectiveConfigsForProject } from "../helpers/resolve-effective-config.ts"
import { AgentDispatchConfigRepository } from "../ports/repositories.ts"

export type AgentDispatchRequestSource =
  | {
      readonly type: "signal"
      readonly organizationId: OrganizationId
      readonly projectId: ProjectId
      readonly signalId: SignalId
      readonly trigger?: "signal.discovered" | "signal.regressed"
    }
  | { readonly type: "incident"; readonly organizationId: OrganizationId; readonly alertIncidentId: string }

export interface AgentDispatchSendRequest {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly configId: string
  readonly integrationId: string
  readonly kind: AgentDispatchKind
  readonly idempotencyKey: string
  readonly trigger: AgentDispatchTrigger
  readonly sourceType: "signal" | "monitor"
  readonly sourceId: string
  readonly prompt: string
  readonly context: AgentDispatchContext
  readonly target: ResolvedDispatchTarget
}

export type RequestAgentDispatchResult =
  | { readonly status: "skipped"; readonly reason: string }
  | { readonly status: "ok"; readonly requests: readonly AgentDispatchSendRequest[] }

const passesTriggerGate = (config: EffectiveAgentDispatchConfig, trigger: AgentDispatchTrigger): boolean =>
  config.triggers.includes(trigger)

const passesGuardrails = (
  config: EffectiveAgentDispatchConfig,
  checks: { readonly count24h: number; readonly recentForSource: boolean },
): string | null => {
  if (checks.count24h >= config.guardrails.maxDispatchesPerDay) return "max-dispatches-per-day"
  if (checks.recentForSource && config.guardrails.cooldownMinutes > 0) return "cooldown"
  return null
}

const dispatchWindow = (date: Date): string => date.toISOString().slice(0, 10)

const buildSendRequest = (input: {
  readonly config: EffectiveAgentDispatchConfig
  readonly target: ResolvedDispatchTarget
  readonly trigger: AgentDispatchTrigger
  readonly sourceType: "signal" | "monitor"
  readonly sourceId: string
  readonly context: AgentDispatchContext
  readonly requestedAt: Date
}): AgentDispatchSendRequest => {
  const idempotencyKey = buildDispatchIdempotencyKey({
    vendor: input.config.kind,
    configId: input.config.id,
    trigger: input.trigger,
    sourceId: input.sourceId,
    dispatchWindow: dispatchWindow(input.requestedAt),
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
    target: input.target,
  }
}

export const requestAgentDispatchUseCase = (input: {
  readonly source: AgentDispatchRequestSource
  readonly webAppUrl: string
}) =>
  Effect.gen(function* () {
    const organizations = yield* OrganizationRepository
    const organization = yield* organizations
      .findById(input.source.organizationId)
      .pipe(Effect.catchTag("NotFoundError", () => Effect.succeed(null)))
    if (organization === null) return { status: "skipped", reason: "organization-not-found" } as const
    if (isSandbox(organization)) return { status: "skipped", reason: "sandbox" } as const

    const configRepo = yield* AgentDispatchConfigRepository
    const incidents = yield* IncidentRepository
    let projectId: ProjectId
    if (input.source.type === "signal") {
      projectId = input.source.projectId
    } else {
      const incidentForProject = yield* incidents
        .findById(AlertIncidentId(input.source.alertIncidentId))
        .pipe(Effect.catchTag("NotFoundError", () => Effect.succeed(null)))
      if (incidentForProject === null) return { status: "skipped", reason: "incident-not-found" } as const
      projectId = incidentForProject.projectId
    }
    const rows = yield* configRepo.listByProjectIncludingDefaults(projectId)
    const configs = resolveEffectiveConfigsForProject(projectId, rows).filter((config) => config.enabled)
    if (configs.length === 0) return { status: "skipped", reason: "no-config" } as const

    if (input.source.type === "signal") {
      const trigger = input.source.trigger ?? "signal.discovered"
      const signals = yield* SignalRepository
      const signal = yield* signals
        .findById(input.source.signalId)
        .pipe(Effect.catchTag("NotFoundError", () => Effect.succeed(null)))
      if (signal === null || signal.projectId !== input.source.projectId) {
        return { status: "skipped", reason: "signal-not-found" } as const
      }
      if (signal.mutedAt !== null) return { status: "skipped", reason: "signal-muted" } as const
      if (signal.ignoredAt !== null) return { status: "skipped", reason: "signal-ignored" } as const
      if (signal.resolvedAt !== null) return { status: "skipped", reason: "signal-resolved" } as const
      // Discovery skips user-created signals; runtime triggers (regression) dispatch regardless of origin.
      if (trigger === "signal.discovered" && signal.origin === "user") {
        return { status: "skipped", reason: "user-origin-signal" } as const
      }

      const context = yield* buildDispatchContextFromSignal({
        organizationId: input.source.organizationId,
        projectId: input.source.projectId,
        signalId: input.source.signalId,
        webAppUrl: input.webAppUrl,
        trigger,
      })

      const requestedAt = new Date()
      const requests: AgentDispatchSendRequest[] = []
      for (const config of configs) {
        if (!passesTriggerGate(config, trigger)) continue
        const readiness = checkTargetReadiness(config.kind, config.target)
        if (!readiness.ready) continue
        const guardrailReason = yield* checkGuardrails(config, signal.id)
        if (guardrailReason !== null) continue
        requests.push(
          buildSendRequest({
            config,
            target: readiness.target,
            trigger,
            sourceType: "signal",
            sourceId: signal.id,
            context,
            requestedAt,
          }),
        )
      }
      if (requests.length === 0) return { status: "skipped", reason: "no-matching-config" } as const
      return { status: "ok", requests } as const
    }

    const incident = yield* incidents
      .findById(AlertIncidentId(input.source.alertIncidentId))
      .pipe(Effect.catchTag("NotFoundError", () => Effect.succeed(null)))
    if (incident === null) return { status: "skipped", reason: "incident-not-found" } as const
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
      if (signal?.ignoredAt !== null && signal?.ignoredAt !== undefined) {
        return { status: "skipped", reason: "signal-ignored" } as const
      }
      if (signal?.resolvedAt !== null && signal?.resolvedAt !== undefined) {
        return { status: "skipped", reason: "signal-resolved" } as const
      }
    }

    const context = yield* buildDispatchContextFromIncident({ incident, trigger, webAppUrl: input.webAppUrl })
    const sourceId = incidentSourceId(incident)
    const sourceType = incidentSourceType(incident)

    const requestedAt = new Date()
    const requests: AgentDispatchSendRequest[] = []
    for (const config of configs) {
      if (!passesTriggerGate(config, trigger)) continue
      const readiness = checkTargetReadiness(config.kind, config.target)
      if (!readiness.ready) continue
      const guardrailReason = yield* checkGuardrails(config, sourceId)
      if (guardrailReason !== null) continue
      requests.push(
        buildSendRequest({
          config,
          target: readiness.target,
          trigger,
          sourceType,
          sourceId,
          context,
          requestedAt,
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
  config: EffectiveAgentDispatchConfig,
  sourceId: string,
): Effect.Effect<string | null, unknown, AgentDispatchConfigRepository | SqlClient> =>
  Effect.gen(function* () {
    const configRepo = yield* AgentDispatchConfigRepository
    const [count24h, recentForSource] = yield* Effect.all([
      configRepo.countDispatchesInLast24h({ configId: config.id, projectId: config.projectId }),
      configRepo.hasRecentDispatchForSource({
        configId: config.id,
        projectId: config.projectId,
        sourceId,
        cooldownMinutes: config.guardrails.cooldownMinutes,
      }),
    ])
    return passesGuardrails(config, { count24h, recentForSource })
  })
