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

/**
 * Minimum positive deviation needed for the "rare" conditional archetypes
 * (Strategist, Scholar) to fire. Below this the user just happens to have
 * a touch more planning/research than baseline — not enough to be a story.
 */
const RARE_EXCESS_THRESHOLD = 0.05

const STRATEGIST_MIN_PLAN_CALLS = 10
const SCHOLAR_MIN_RESEARCH_CALLS = 5

const CONSULTANT_MAX_LINES_TOUCHED = 200
const CONSULTANT_MIN_SESSIONS = 5

const SHIPPER_MIN_COMMITS = 5
const SHIPPER_MIN_COMMITS_PER_SESSION = 1.0

const TESTER_MIN_TESTS = 20
const TESTER_MIN_TESTS_PER_SESSION = 2

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
  readonly testsRun: number
  readonly linesAdded: number
  readonly linesWritten: number
  readonly linesRead: number
}

/**
 * Pure, deterministic personality assignment.
 *
 * Priority order (first rule that fires wins):
 *   1. Strategist  — plan excess ≥ 5pp AND ≥ 10 plan calls
 *   2. Scholar     — research excess ≥ 5pp AND ≥ 5 research calls
 *   3. Consultant  — sessions ≥ 5 AND linesAdded + linesWritten < 200
 *   4. Shipper     — commits ≥ 5 AND commits/session ≥ 1.0
 *   5. Tester      — testsRun ≥ 20 AND testsRun/session ≥ 2
 *   6. Tool-mix winner by *excess over baseline* among Surgeon (edit),
 *      Architect (write), Detective (read + search), Conductor (bash).
 *
 * The baseline-excess fallback is the key trick that keeps "Detective" from
 * eating every report — Read is always the absolute biggest bucket, but
 * once we subtract its expected share, Edit/Bash/Write outliers can win.
 */
export function assignPersonality(input: AssignPersonalityInput): Personality {
  const { toolMix, sessions, filesTouched, commandsRun, commits, testsRun, linesAdded, linesWritten, linesRead } = input
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

  // 1. Strategist — planning is rare; even small excess is loud.
  const planExcess = excessOf("plan")
  if (planExcess >= RARE_EXCESS_THRESHOLD && toolMix.plan >= STRATEGIST_MIN_PLAN_CALLS) {
    return {
      kind: "strategist",
      score: normaliseScore(planExcess, RARE_EXCESS_THRESHOLD, 0.3),
      evidence: [
        `${formatPercent(shareOf("plan"))} of your tool calls were planning steps`,
        `${formatCount(toolMix.plan)} TaskCreate / TaskUpdate / TodoWrite calls`,
        `${formatCount(sessions)} session${sessions === 1 ? "" : "s"} across the week`,
      ],
    }
  }

  // 2. Scholar — web research is rarer still.
  const researchExcess = excessOf("research")
  if (researchExcess >= RARE_EXCESS_THRESHOLD && toolMix.research >= SCHOLAR_MIN_RESEARCH_CALLS) {
    return {
      kind: "scholar",
      score: normaliseScore(researchExcess, RARE_EXCESS_THRESHOLD, 0.3),
      evidence: [
        `${formatPercent(shareOf("research"))} of your tool calls were web research`,
        `${formatCount(toolMix.research)} WebFetch / WebSearch call${toolMix.research === 1 ? "" : "s"}`,
        `${formatCount(linesRead)} line${linesRead === 1 ? "" : "s"} read alongside`,
      ],
    }
  }

  // 3. Consultant — many sessions, barely any code shipped.
  const linesTouchedTotal = linesAdded + linesWritten
  if (sessions >= CONSULTANT_MIN_SESSIONS && linesTouchedTotal < CONSULTANT_MAX_LINES_TOUCHED) {
    return {
      kind: "consultant",
      score: normaliseScore(sessions, CONSULTANT_MIN_SESSIONS, 20),
      evidence: [
        `${formatCount(sessions)} session${sessions === 1 ? "" : "s"} this week`,
        linesTouchedTotal === 0
          ? "No lines of code written or edited"
          : `Only ${formatCount(linesTouchedTotal)} line${linesTouchedTotal === 1 ? "" : "s"} of code written or edited`,
        `${formatCount(filesTouched)} file${filesTouched === 1 ? "" : "s"} touched`,
      ],
    }
  }

  // 4. Shipper — repeat closer, sustained across sessions.
  if (sessions > 0 && commits >= SHIPPER_MIN_COMMITS && commits / sessions >= SHIPPER_MIN_COMMITS_PER_SESSION) {
    const commitsPerSession = commits / sessions
    return {
      kind: "shipper",
      score: normaliseScore(commitsPerSession, SHIPPER_MIN_COMMITS_PER_SESSION, 5),
      evidence: [
        `${formatCount(commits)} commit${commits === 1 ? "" : "s"} this week`,
        `${commitsPerSession.toFixed(1)} commits per session, on average`,
        `${formatCount(sessions)} session${sessions === 1 ? "" : "s"} of focused work`,
      ],
    }
  }

  // 5. Tester — test runner heavy, sustained across sessions.
  if (sessions > 0 && testsRun >= TESTER_MIN_TESTS && testsRun / sessions >= TESTER_MIN_TESTS_PER_SESSION) {
    const testsPerSession = testsRun / sessions
    return {
      kind: "tester",
      score: normaliseScore(testsPerSession, TESTER_MIN_TESTS_PER_SESSION, 10),
      evidence: [
        `${formatCount(testsRun)} test run${testsRun === 1 ? "" : "s"} this week`,
        `${testsPerSession.toFixed(1)} test runs per session, on average`,
        `${formatCount(commandsRun)} total shell command${commandsRun === 1 ? "" : "s"}`,
      ],
    }
  }

  // 6. Tool-mix winner by baseline excess.
  const candidates: ReadonlyArray<{
    readonly kind: PersonalityKind
    readonly excess: number
    readonly buildEvidence: () => readonly [string, string, string]
  }> = [
    {
      kind: "surgeon",
      excess: excessOf("edit"),
      buildEvidence: () => [
        `${formatPercent(shareOf("edit"))} of your tool calls were Edits`,
        `Touched ${formatCount(filesTouched)} file${filesTouched === 1 ? "" : "s"} this week`,
        `${formatCount(toolMix.write)} Write call${toolMix.write === 1 ? "" : "s"} on top`,
      ],
    },
    {
      kind: "architect",
      excess: excessOf("write"),
      buildEvidence: () => [
        `${formatPercent(shareOf("write"))} of your tool calls were Writes`,
        `${formatCount(toolMix.write)} file${toolMix.write === 1 ? "" : "s"} written`,
        `Touched ${formatCount(filesTouched)} file${filesTouched === 1 ? "" : "s"} in total`,
      ],
    },
    {
      kind: "detective",
      // Detective covers both codebase exploration buckets, so we sum their
      // excesses (each baseline is subtracted independently).
      excess: excessOf("read") + excessOf("search"),
      buildEvidence: () => [
        `${formatPercent(shareOf("read") + shareOf("search"))} of your tool calls were investigation (Read / Grep / Glob)`,
        `${formatCount(toolMix.read)} file read${toolMix.read === 1 ? "" : "s"}`,
        `${formatCount(toolMix.search)} search${toolMix.search === 1 ? "" : "es"} across the codebase`,
      ],
    },
    {
      kind: "conductor",
      excess: excessOf("bash"),
      buildEvidence: () => [
        `${formatPercent(shareOf("bash"))} of your tool calls were shell commands`,
        `${formatCount(commandsRun)} command${commandsRun === 1 ? "" : "s"} run from Bash`,
        `${formatCount(sessions)} session${sessions === 1 ? "" : "s"} this week`,
      ],
    },
  ]

  // Deterministic tie-break: the candidates array order is the tie-break order
  // (Surgeon > Architect > Detective > Conductor). `Array.prototype.sort` is
  // stable in modern engines, so equal-excess ties keep that order.
  const winner = [...candidates].sort((a, b) => b.excess - a.excess)[0] ?? candidates[0]
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
    // The excess can be negative when nothing stood out — clamp so score
    // stays in [0, 1]. Saturate at +0.3 (30pp above baseline) which is a
    // very strong signal.
    score: normaliseScore(Math.max(0, winner.excess), 0, 0.3),
    evidence: [e1, e2, e3],
  }
}
