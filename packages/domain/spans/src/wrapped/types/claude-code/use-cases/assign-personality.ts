import type { Personality, PersonalityKind, ToolBucket, ToolMix } from "../entities/report.ts"

/**
 * Expected share of each bucket in a "typical" Claude Code week. The
 * personality algorithm subtracts these from the user's actual shares so
 * that "dominant" reflects deviation from the baseline rather than raw
 * volume. Read is always huge and Plan is always tiny — the bucket that
 * stands out is the one the user *chose* to lean into.
 *
 * Numbers are first-pass guesses. Easy to retune from a one-shot ClickHouse
 * percentile sample once we have a week or two of real data.
 */
const BASELINE_SHARE: Record<ToolBucket, number> = {
  read: 0.4,
  bash: 0.2,
  edit: 0.15,
  search: 0.1,
  write: 0.05,
  plan: 0.03,
  research: 0.02,
  other: 0.05,
}

// Each archetype has a `gate` (minimum signal floor — below it, the
// archetype can't fire at all) and a `score` formula mapping its signal
// into [0, 1]. `assignPersonality` filters to gate-passers and returns
// the highest-scoring one.
//
// The 5 *conditional* archetypes (Strategist/Scholar/Consultant/Shipper/
// Tester) get a multiplicative `RARE_BONUS` over their normalised score:
// once their gate passes (which requires a real, non-trivial signal),
// they deserve to beat a moderate (~0.5) tool-mix winner. Otherwise the
// always-firing tool-mix archetypes drown out genuine planner / shipper /
// tester signals at every realistic activity level.

const STRATEGIST_GATE_EXCESS = 0.05
const STRATEGIST_GATE_CALLS = 10
const STRATEGIST_SCORE_LOW = 0.05
const STRATEGIST_SCORE_HIGH = 0.2

const SCHOLAR_GATE_EXCESS = 0.05
const SCHOLAR_GATE_CALLS = 5
const SCHOLAR_SCORE_LOW = 0.05
const SCHOLAR_SCORE_HIGH = 0.2

const CONSULTANT_GATE_SESSIONS = 5
const CONSULTANT_GATE_MAX_LINES = 200
// `LOW` sits below the gate floor on purpose: at exactly 5 sessions the gate
// passes and the normalised score is `(5-4)/(8-4) = 0.25`, which then gets
// the rarity bonus. Otherwise a borderline Consultant would score 0 and
// always lose to any tool-mix winner.
const CONSULTANT_SCORE_LOW = 4
const CONSULTANT_SCORE_HIGH = 8

// Shipper now reads from two complementary signals:
//   - distinct commit SHAs over the window  → `commits` / `commitsPerSession`
//   - git write-ops (push/merge/rebase/...) → `gitWriteOps`
// Either can fire the gate; the score takes the max of both normalised
// signals so squash-pushers, force-pushers, and tag-and-release flows
// aren't penalised for low commit counts.
const SHIPPER_GATE_COMMITS = 5
const SHIPPER_GATE_WRITE_OPS = 8
const SHIPPER_GATE_COMMITS_PER_SESSION = 1.0
const SHIPPER_GATE_WRITE_OPS_PER_SESSION = 1.5
const SHIPPER_COMMITS_PER_SESSION_LOW = 1.0
const SHIPPER_COMMITS_PER_SESSION_HIGH = 2.5
const SHIPPER_WRITE_OPS_PER_SESSION_LOW = 1.5
const SHIPPER_WRITE_OPS_PER_SESSION_HIGH = 4.0

const TESTER_GATE_TESTS = 20
const TESTER_GATE_RATIO = 2.0
const TESTER_SCORE_LOW = 2.0
const TESTER_SCORE_HIGH = 8.0

const TOOL_MIX_SCORE_HIGH = 0.3

// Multiplier applied to the 5 conditional archetypes' raw scores. Their
// gates already require a meaningful signal floor, so once they fire we
// want them to outrank a moderate tool-mix winner. Score is still capped
// to [0, 1] downstream.
const RARE_BONUS = 1.5

const sumMix = (mix: ToolMix): number =>
  mix.bash + mix.read + mix.edit + mix.write + mix.search + mix.research + mix.plan + mix.other

const normaliseScore = (value: number, low: number, high: number): number => {
  if (high <= low) return 1
  const t = (value - low) / (high - low)
  if (t < 0) return 0
  if (t > 1) return 1
  return t
}

const formatPercent = (n: number): string => `${Math.round(n * 100)}%`
const formatCount = (n: number): string => n.toLocaleString("en-US")

interface AssignPersonalityInput {
  readonly toolMix: ToolMix
  readonly sessions: number
  readonly filesTouched: number
  readonly commandsRun: number
  readonly commits: number
  /**
   * Count of git operations that mutate repo state (commit / push / merge
   * / rebase / tag / revert / cherry-pick). Used alongside `commits` so
   * users who squash-push or tag-release still register as shippers.
   */
  readonly gitWriteOps: number
  readonly testsRun: number
  /** Lines added by Edit / MultiEdit / NotebookEdit — the "+N" component. */
  readonly editAdded: number
  /** Lines written by Write / NotebookEdit `content` — disjoint from `editAdded`. */
  readonly writeLines: number
  readonly linesRead: number
}

interface Candidate {
  readonly kind: PersonalityKind
  readonly gatePasses: boolean
  readonly score: number
  readonly buildEvidence: () => readonly [string, string, string]
}

/**
 * Pure, deterministic personality assignment via **gate-then-rank**:
 *
 *   1. Build a candidate for every archetype with a `gatePasses` boolean
 *      and a `score` in [0, 1].
 *   2. Keep only the candidates whose gate passes.
 *   3. Return the one with the highest score.
 *
 * The four tool-mix archetypes (Surgeon, Architect, Detective, Conductor)
 * always pass their gate so at least one candidate is always eligible.
 * The five conditional archetypes (Strategist, Scholar, Consultant,
 * Shipper, Tester) require a minimum signal floor to fire at all; once
 * they do, their score competes head-to-head with the tool-mix scores.
 *
 * Tie-break is candidate-array order (Strategist > Scholar > Consultant >
 * Shipper > Tester > Surgeon > Architect > Detective > Conductor) via
 * stable sort — a small bias toward the rarer archetypes when scores match.
 */
export function assignPersonality(input: AssignPersonalityInput): Personality {
  const {
    toolMix,
    sessions,
    filesTouched,
    commandsRun,
    commits,
    gitWriteOps,
    testsRun,
    editAdded,
    writeLines,
    linesRead,
  } = input
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
  const excessOf = (bucket: ToolBucket): number => shareOf(bucket) - BASELINE_SHARE[bucket]

  const planExcess = excessOf("plan")
  const researchExcess = excessOf("research")
  const editExcess = excessOf("edit")
  const writeExcess = excessOf("write")
  const investigationExcess = excessOf("read") + excessOf("search")
  const bashExcess = excessOf("bash")

  const commitsPerSession = sessions > 0 ? commits / sessions : 0
  const writeOpsPerSession = sessions > 0 ? gitWriteOps / sessions : 0
  const testsPerSession = sessions > 0 ? testsRun / sessions : 0
  // Total lines of code touched this week (disjoint components — no overlap).
  const linesTouchedTotal = editAdded + writeLines

  // Bound to ≤ 1.0 so a saturated conditional score doesn't run away into
  // [1, 1.5]; the relative ordering between archetypes is still the lift
  // that matters.
  const applyRareBonus = (s: number) => Math.min(1, s * RARE_BONUS)

  const candidates: readonly Candidate[] = [
    {
      kind: "strategist",
      gatePasses: planExcess >= STRATEGIST_GATE_EXCESS && toolMix.plan >= STRATEGIST_GATE_CALLS,
      score: applyRareBonus(normaliseScore(planExcess, STRATEGIST_SCORE_LOW, STRATEGIST_SCORE_HIGH)),
      buildEvidence: () => [
        `${formatPercent(shareOf("plan"))} of your tool calls were planning steps`,
        `${formatCount(toolMix.plan)} TaskCreate / TaskUpdate / TodoWrite calls`,
        `${formatCount(sessions)} session${sessions === 1 ? "" : "s"} across the week`,
      ],
    },
    {
      kind: "scholar",
      gatePasses: researchExcess >= SCHOLAR_GATE_EXCESS && toolMix.research >= SCHOLAR_GATE_CALLS,
      score: applyRareBonus(normaliseScore(researchExcess, SCHOLAR_SCORE_LOW, SCHOLAR_SCORE_HIGH)),
      buildEvidence: () => [
        `${formatPercent(shareOf("research"))} of your tool calls were web research`,
        `${formatCount(toolMix.research)} WebFetch / WebSearch call${toolMix.research === 1 ? "" : "s"}`,
        `${formatCount(linesRead)} line${linesRead === 1 ? "" : "s"} read alongside`,
      ],
    },
    {
      kind: "consultant",
      gatePasses: sessions >= CONSULTANT_GATE_SESSIONS && linesTouchedTotal < CONSULTANT_GATE_MAX_LINES,
      score: applyRareBonus(normaliseScore(sessions, CONSULTANT_SCORE_LOW, CONSULTANT_SCORE_HIGH)),
      buildEvidence: () => [
        `${formatCount(sessions)} session${sessions === 1 ? "" : "s"} this week`,
        linesTouchedTotal === 0
          ? "No lines of code written or edited"
          : `Only ${formatCount(linesTouchedTotal)} line${linesTouchedTotal === 1 ? "" : "s"} of code written or edited`,
        `${formatCount(filesTouched)} file${filesTouched === 1 ? "" : "s"} touched`,
      ],
    },
    {
      kind: "shipper",
      gatePasses:
        (commits >= SHIPPER_GATE_COMMITS || gitWriteOps >= SHIPPER_GATE_WRITE_OPS) &&
        (commitsPerSession >= SHIPPER_GATE_COMMITS_PER_SESSION ||
          writeOpsPerSession >= SHIPPER_GATE_WRITE_OPS_PER_SESSION),
      score: applyRareBonus(
        Math.max(
          normaliseScore(commitsPerSession, SHIPPER_COMMITS_PER_SESSION_LOW, SHIPPER_COMMITS_PER_SESSION_HIGH),
          normaliseScore(writeOpsPerSession, SHIPPER_WRITE_OPS_PER_SESSION_LOW, SHIPPER_WRITE_OPS_PER_SESSION_HIGH),
        ),
      ),
      buildEvidence: () => [
        commits >= gitWriteOps
          ? `${formatCount(commits)} commit${commits === 1 ? "" : "s"} this week`
          : `${formatCount(gitWriteOps)} git push / commit / merge operation${gitWriteOps === 1 ? "" : "s"}`,
        commitsPerSession >= writeOpsPerSession
          ? `${commitsPerSession.toFixed(1)} commits per session, on average`
          : `${writeOpsPerSession.toFixed(1)} shipping actions per session, on average`,
        `${formatCount(sessions)} session${sessions === 1 ? "" : "s"} of focused work`,
      ],
    },
    {
      kind: "tester",
      gatePasses: testsRun >= TESTER_GATE_TESTS && testsPerSession >= TESTER_GATE_RATIO,
      score: applyRareBonus(normaliseScore(testsPerSession, TESTER_SCORE_LOW, TESTER_SCORE_HIGH)),
      buildEvidence: () => [
        `${formatCount(testsRun)} test run${testsRun === 1 ? "" : "s"} this week`,
        `${testsPerSession.toFixed(1)} test runs per session, on average`,
        `${formatCount(commandsRun)} total shell command${commandsRun === 1 ? "" : "s"}`,
      ],
    },
    {
      kind: "surgeon",
      gatePasses: true,
      score: normaliseScore(editExcess, 0, TOOL_MIX_SCORE_HIGH),
      buildEvidence: () => [
        `${formatPercent(shareOf("edit"))} of your tool calls were Edits`,
        `Touched ${formatCount(filesTouched)} file${filesTouched === 1 ? "" : "s"} this week`,
        `${formatCount(toolMix.write)} Write call${toolMix.write === 1 ? "" : "s"} on top`,
      ],
    },
    {
      kind: "architect",
      gatePasses: true,
      score: normaliseScore(writeExcess, 0, TOOL_MIX_SCORE_HIGH),
      buildEvidence: () => [
        `${formatPercent(shareOf("write"))} of your tool calls were Writes`,
        `${formatCount(toolMix.write)} file${toolMix.write === 1 ? "" : "s"} written`,
        `Touched ${formatCount(filesTouched)} file${filesTouched === 1 ? "" : "s"} in total`,
      ],
    },
    {
      kind: "detective",
      gatePasses: true,
      score: normaliseScore(investigationExcess, 0, TOOL_MIX_SCORE_HIGH),
      buildEvidence: () => [
        `${formatPercent(shareOf("read") + shareOf("search"))} of your tool calls were investigation (Read / Grep / Glob)`,
        `${formatCount(toolMix.read)} file read${toolMix.read === 1 ? "" : "s"}`,
        `${formatCount(toolMix.search)} search${toolMix.search === 1 ? "" : "es"} across the codebase`,
      ],
    },
    {
      kind: "conductor",
      gatePasses: true,
      score: normaliseScore(bashExcess, 0, TOOL_MIX_SCORE_HIGH),
      buildEvidence: () => [
        `${formatPercent(shareOf("bash"))} of your tool calls were shell commands`,
        `${formatCount(commandsRun)} command${commandsRun === 1 ? "" : "s"} run from Bash`,
        `${formatCount(sessions)} session${sessions === 1 ? "" : "s"} this week`,
      ],
    },
  ]

  // Filter to gate-passers, then rank by score. Stable sort preserves
  // candidate-array order as the tie-break.
  const eligible = candidates.filter((c) => c.gatePasses)
  const winner = [...eligible].sort((a, b) => b.score - a.score)[0]

  // The 4 tool-mix archetypes always pass their gate, so `eligible` is never
  // empty in practice — but TS can't see that, and the defence is cheap.
  if (!winner) {
    return {
      kind: "detective",
      score: 0,
      evidence: ["No tool-mix data available.", "", ""],
    }
  }

  const [e1, e2, e3] = winner.buildEvidence()
  return { kind: winner.kind, score: winner.score, evidence: [e1, e2, e3] }
}
