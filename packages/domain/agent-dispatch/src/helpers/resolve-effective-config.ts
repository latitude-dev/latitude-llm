import type { ProjectId } from "@domain/shared"
import type { z } from "zod"
import { DEFAULT_COOLDOWN_MINUTES, DEFAULT_MAX_DISPATCHES_PER_DAY } from "../constants.ts"
import {
  type AgentDispatchConfigRow,
  type AgentDispatchKind,
  type AgentDispatchTarget,
  agentDispatchKindSchema,
  claudeDispatchTargetSchema,
  cursorDispatchTargetSchema,
  type EffectiveAgentDispatchConfig,
  linearDispatchTargetSchema,
  type ResolvedDispatchTarget,
  type StoredAgentDispatchTarget,
  webhookDispatchTargetSchema,
} from "../entities/agent-dispatch-config.ts"

const FULL_TARGET_SCHEMAS: Record<AgentDispatchKind, z.ZodType<AgentDispatchTarget>> = {
  cursor: cursorDispatchTargetSchema,
  claude_code: claudeDispatchTargetSchema,
  linear: linearDispatchTargetSchema,
  webhook: webhookDispatchTargetSchema,
}

export interface ResolveEffectiveConfigInput {
  readonly projectId: ProjectId
  readonly defaultConfig: AgentDispatchConfigRow | null
  readonly override: AgentDispatchConfigRow | null
}

export function resolveEffectiveConfig(input: ResolveEffectiveConfigInput): EffectiveAgentDispatchConfig | null {
  const base = input.override ?? input.defaultConfig
  if (!base) return null
  return {
    id: base.id,
    organizationId: base.organizationId,
    projectId: input.projectId,
    integrationId: base.integrationId,
    kind: base.kind,
    enabled: input.override?.enabled ?? input.defaultConfig?.enabled ?? false,
    triggers: input.override?.triggers ?? input.defaultConfig?.triggers ?? [],
    target: input.override?.target ?? input.defaultConfig?.target ?? null,
    promptTemplate: input.override?.promptTemplate ?? input.defaultConfig?.promptTemplate ?? null,
    guardrails: input.override?.guardrails ??
      input.defaultConfig?.guardrails ?? {
        maxDispatchesPerDay: DEFAULT_MAX_DISPATCHES_PER_DAY,
        cooldownMinutes: DEFAULT_COOLDOWN_MINUTES,
      },
  }
}

export function resolveEffectiveConfigsForProject(
  projectId: ProjectId,
  rows: readonly AgentDispatchConfigRow[],
): readonly EffectiveAgentDispatchConfig[] {
  const byIntegration = new Map<
    string,
    { defaultConfig: AgentDispatchConfigRow | null; override: AgentDispatchConfigRow | null }
  >()
  for (const row of rows) {
    const group = byIntegration.get(row.integrationId) ?? { defaultConfig: null, override: null }
    if (row.projectId === null) group.defaultConfig = row
    else if (row.projectId === projectId) group.override = row
    byIntegration.set(row.integrationId, group)
  }
  return [...byIntegration.values()]
    .map((group) => resolveEffectiveConfig({ projectId, ...group }))
    .filter((config) => config !== null)
}

export type TargetReadiness =
  | { readonly ready: true; readonly target: ResolvedDispatchTarget }
  | { readonly ready: false; readonly missing: readonly string[] }

export function checkTargetReadiness(
  kind: AgentDispatchKind,
  target: StoredAgentDispatchTarget | null,
): TargetReadiness {
  const result = FULL_TARGET_SCHEMAS[kind].safeParse(target ?? {})
  if (result.success) return { ready: true, target: { ...result.data, kind } }
  const missing = [...new Set(result.error.issues.map((issue) => issue.path.join(".")))]
  return { ready: false, missing }
}

export function parseResolvedDispatchTarget(value: unknown): ResolvedDispatchTarget | null {
  if (typeof value !== "object" || value === null || !("kind" in value)) return null
  const kind = agentDispatchKindSchema.safeParse(value.kind)
  if (!kind.success) return null
  const target = FULL_TARGET_SCHEMAS[kind.data].safeParse(value)
  if (!target.success) return null
  return { ...target.data, kind: kind.data }
}
