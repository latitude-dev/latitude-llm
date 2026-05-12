import type { Personality, PersonalityKind, ToolBucket, ToolMix } from "../entities/report.ts"

/**
 * Threshold for the Strategist archetype. Anyone with at least 15% of their
 * tool calls in the planning bucket (TaskCreate / TaskUpdate) gets it.
 * Planning is rare enough that this is a strong signal — and flattering.
 */
const STRATEGIST_PLAN_SHARE_THRESHOLD = 0.15

/**
 * Threshold for the Marathoner archetype. Average session wall-clock has to
 * exceed 45 minutes. Kept rare so the archetype reveal stays meaningful.
 */
const MARATHONER_AVG_SESSION_MS_THRESHOLD = 45 * 60 * 1000

/**
 * Upper anchor for the Marathoner score (4 hours). Score = 1.0 here.
 */
const MARATHONER_AVG_SESSION_MS_SATURATION = 4 * 60 * 60 * 1000

const sumMix = (mix: ToolMix): number => mix.bash + mix.read + mix.edit + mix.write + mix.search + mix.plan + mix.other

const normaliseScore = (value: number, low: number, high: number): number => {
  if (high <= low) return 1
  const t = (value - low) / (high - low)
  if (t < 0) return 0
  if (t > 1) return 1
  return t
}

const formatPercent = (n: number): string => `${Math.round(n * 100)}%`

const formatHoursMinutes = (ms: number): string => {
  const minutes = Math.round(ms / 60000)
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"}`
  const hours = Math.floor(minutes / 60)
  const remaining = minutes % 60
  if (remaining === 0) return `${hours} hour${hours === 1 ? "" : "s"}`
  return `${hours}h ${remaining}m`
}

interface AssignPersonalityInput {
  readonly toolMix: ToolMix
  readonly sessions: number
  readonly totalDurationMs: number
  readonly filesTouched: number
  readonly commandsRun: number
}

/**
 * Pure, deterministic personality assignment.
 *
 * Priority order (first rule that fires wins):
 *   1. Strategist  — planning share ≥ 15%
 *   2. Marathoner  — average session ≥ 45 minutes
 *   3. Tool-mix winner among Surgeon (edit), Architect (write),
 *      Detective (read + search), Conductor (bash).
 *
 * The priority exists so the rarer / more flattering archetypes don't get
 * drowned out by Bash/Read bulk. Returns the assigned archetype with a
 * 0..1 confidence score and three short evidence strings the email displays
 * under the reveal card.
 */
export function assignPersonality(input: AssignPersonalityInput): Personality {
  const { toolMix, sessions, totalDurationMs, filesTouched, commandsRun } = input
  const total = sumMix(toolMix)

  // Guarded by the no-activity short-circuit upstream — but defend in depth
  // so an empty-mix Report can never produce a NaN score.
  if (total === 0) {
    return {
      kind: "detective",
      score: 0,
      evidence: ["No Claude Code activity recorded.", "", ""],
    }
  }

  const shareOf = (bucket: ToolBucket): number => toolMix[bucket] / total
  const avgSessionMs = sessions > 0 ? totalDurationMs / sessions : 0

  // 1. Strategist
  const planShare = shareOf("plan")
  if (planShare >= STRATEGIST_PLAN_SHARE_THRESHOLD) {
    return {
      kind: "strategist",
      score: normaliseScore(planShare, STRATEGIST_PLAN_SHARE_THRESHOLD, 0.5),
      evidence: [
        `${formatPercent(planShare)} of your tool calls were planning steps`,
        `${toolMix.plan.toLocaleString("en-US")} TaskCreate / TaskUpdate calls`,
        `${sessions.toLocaleString("en-US")} session${sessions === 1 ? "" : "s"} across the week`,
      ],
    }
  }

  // 2. Marathoner
  if (avgSessionMs >= MARATHONER_AVG_SESSION_MS_THRESHOLD) {
    return {
      kind: "marathoner",
      score: normaliseScore(avgSessionMs, MARATHONER_AVG_SESSION_MS_THRESHOLD, MARATHONER_AVG_SESSION_MS_SATURATION),
      evidence: [
        `Average session length: ${formatHoursMinutes(avgSessionMs)}`,
        `${sessions.toLocaleString("en-US")} long focus session${sessions === 1 ? "" : "s"}`,
        `${total.toLocaleString("en-US")} tool calls across them`,
      ],
    }
  }

  // 3. Tool-mix winner.
  const candidates: ReadonlyArray<{
    readonly kind: PersonalityKind
    readonly share: number
    readonly buildEvidence: () => readonly [string, string, string]
  }> = [
    {
      kind: "surgeon",
      share: shareOf("edit"),
      buildEvidence: () => [
        `${formatPercent(shareOf("edit"))} of your tool calls were Edits`,
        `Touched ${filesTouched.toLocaleString("en-US")} file${filesTouched === 1 ? "" : "s"} this week`,
        // Avoid claiming "new files" — `Write` overwrites existing paths too.
        `${toolMix.write.toLocaleString("en-US")} Write call${toolMix.write === 1 ? "" : "s"} on top`,
      ],
    },
    {
      kind: "architect",
      share: shareOf("write"),
      buildEvidence: () => [
        `${formatPercent(shareOf("write"))} of your tool calls were Writes`,
        `${toolMix.write.toLocaleString("en-US")} file${toolMix.write === 1 ? "" : "s"} written`,
        `Touched ${filesTouched.toLocaleString("en-US")} file${filesTouched === 1 ? "" : "s"} in total`,
      ],
    },
    {
      kind: "detective",
      share: shareOf("read") + shareOf("search"),
      buildEvidence: () => [
        `${formatPercent(shareOf("read") + shareOf("search"))} of your tool calls were investigation (Read / Grep / Glob)`,
        `${toolMix.read.toLocaleString("en-US")} file read${toolMix.read === 1 ? "" : "s"}`,
        `${toolMix.search.toLocaleString("en-US")} search${toolMix.search === 1 ? "" : "es"} across the codebase`,
      ],
    },
    {
      kind: "conductor",
      share: shareOf("bash"),
      buildEvidence: () => [
        `${formatPercent(shareOf("bash"))} of your tool calls were shell commands`,
        `${commandsRun.toLocaleString("en-US")} command${commandsRun === 1 ? "" : "s"} run from Bash`,
        `${sessions.toLocaleString("en-US")} session${sessions === 1 ? "" : "s"} this week`,
      ],
    },
  ]

  // Deterministic tie-break: the candidates array order is the tie-break order
  // (Surgeon > Architect > Detective > Conductor). Math.max via sort with
  // stable Array.prototype.sort guarantees we keep that order for ties.
  const winner = [...candidates].sort((a, b) => b.share - a.share)[0] ?? candidates[0]
  if (!winner) {
    // Unreachable because candidates is a non-empty literal, but the type
    // narrows aren't smart enough — fall back to detective.
    return {
      kind: "detective",
      score: 0,
      evidence: ["No tool-mix data available.", "", ""],
    }
  }

  const [e1, e2, e3] = winner.buildEvidence()
  return {
    kind: winner.kind,
    score: normaliseScore(winner.share, 0, 1),
    evidence: [e1, e2, e3],
  }
}
