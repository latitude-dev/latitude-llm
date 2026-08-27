/**
 * Hardcoded fixtures for the Agent Score design mock. No query, no snapshot table: every
 * figure below is hand-computed from `specs/agent-benchmark.md` so the arithmetic the page
 * claims (deficits summing to `100 - score`, gains summing to less, shares summing to the
 * dimension's deficit) actually holds while the design is being reviewed.
 */

export type CauseSeverity = "ruined" | "degraded"

/** Which detector produced the row, in the vocabulary the spec uses to decide how much it is trusted. */
export type CauseEvidence = "mechanical" | "flagger" | "signal" | "moment"

export type CauseTrend = "worse" | "better" | "flat"

export type DestinationSection = "sessions" | "tools" | "memory" | "cost" | "signals" | "behaviours"

export interface CauseDestination {
  readonly label: string
  readonly section: DestinationSection
}

export interface ScoreCause {
  readonly key: string
  readonly title: string
  readonly severity: CauseSeverity
  readonly evidence: CauseEvidence
  readonly sessions: number
  /** Composite points recovered if this cause alone is fixed. `null` below the session floor. */
  readonly gain: number | null
  /** Composite points attributed to this cause, splitting overlapping sessions evenly. */
  readonly share: number | null
  readonly trend: CauseTrend
  /** Same cause in the previous window, so the row can say which way it moved. */
  readonly previousSessions: number | null
  /** Spend inside the affected sessions. `null` when the window is too small to bother. */
  readonly costLabel: string | null
  readonly detail: string
  /** The fix follows from the metric definition, so the row can promise a specific change. */
  readonly quickWin?: boolean
  readonly destination: CauseDestination
}

export interface DimensionBuckets {
  readonly ruined: number
  readonly degraded: number
  readonly clean: number
  readonly denominator: number
  readonly denominatorLabel: string
}

export interface ApdexDimension {
  readonly kind: "apdex"
  readonly key: "outcome" | "reliability" | "process"
  readonly label: string
  /** The compact form, used in the summary rows. */
  readonly question: string
  /** One sentence on what the dimension covers, used in its section header. */
  readonly description: string
  readonly weight: number
  /** The weight after renormalizing over the dimensions that passed their applicability gates. */
  readonly effectiveWeight: number | null
  readonly subScore: number | null
  readonly deficit: number | null
  readonly buckets: DimensionBuckets | null
  readonly notMeasured: string | null
  readonly causes: readonly ScoreCause[]
}

export interface EfficiencyMetric {
  readonly key: string
  readonly label: string
  readonly value: string
  readonly good: string
  readonly poor: string
  /** 0..1 curve output. `null` when the metric does not apply, or below the session floor. */
  readonly curve: number | null
  readonly deficit: number | null
  readonly trend: CauseTrend
  readonly detail: string
  readonly notMeasured: string | null
  readonly destination: CauseDestination
}

export interface EfficiencyDimension {
  readonly kind: "curves"
  readonly key: "efficiency"
  readonly label: string
  readonly question: string
  readonly description: string
  readonly weight: number
  readonly effectiveWeight: number | null
  readonly subScore: number | null
  readonly deficit: number | null
  readonly notMeasured: string | null
  readonly metrics: readonly EfficiencyMetric[]
}

export type ScoreDimension = ApdexDimension | EfficiencyDimension

export interface SafetyCap {
  readonly confirmedFailures: number
  readonly classifiedSessions: number
  readonly classifiedShare: number
  readonly exposureCount: number
  readonly cap: number
  readonly isBinding: boolean
  /** Points the cap removed: the uncapped composite minus the capped one. */
  readonly deficit: number
  readonly rateTestNote: string
}

export type AgentScoreSnapshotKey = "support" | "coding" | "prelaunch"

export interface AgentScoreSnapshot {
  readonly key: AgentScoreSnapshotKey
  readonly label: string
  readonly summary: string
  readonly score: number | null
  readonly uncappedScore: number | null
  readonly previousScore: number | null
  readonly intervalHalfWidth: number | null
  readonly isProvisional: boolean
  readonly windowDays: number
  readonly eligibleSessions: number
  readonly minSessions: number
  readonly history: readonly { readonly day: string; readonly score: number }[]
  readonly frozenAt: string
  readonly scoringVersion: string
  readonly dimensions: readonly ScoreDimension[]
  readonly safety: SafetyCap
}

const SUPPORT_AGENT: AgentScoreSnapshot = {
  key: "support",
  label: "Support agent",
  summary: "Four dimensions scored, safety cap not binding",
  score: 66.3,
  uncappedScore: 66.3,
  previousScore: 71,
  intervalHalfWidth: 3,
  isProvisional: false,
  windowDays: 7,
  eligibleSessions: 1200,
  minSessions: 30,
  history: [
    { day: "Aug 14", score: 74 },
    { day: "Aug 15", score: 73 },
    { day: "Aug 16", score: 73 },
    { day: "Aug 17", score: 72 },
    { day: "Aug 18", score: 71 },
    { day: "Aug 19", score: 71 },
    { day: "Aug 20", score: 72 },
    { day: "Aug 21", score: 71 },
    { day: "Aug 22", score: 70 },
    { day: "Aug 23", score: 69 },
    { day: "Aug 24", score: 71 },
    { day: "Aug 25", score: 69 },
    { day: "Aug 26", score: 71 },
    { day: "Aug 27", score: 66.3 },
  ],
  frozenAt: "Aug 27, 03:00 UTC",
  scoringVersion: "v1",
  dimensions: [
    {
      kind: "apdex",
      key: "outcome",
      label: "Outcome quality",
      question: "Did users get what they came for?",
      description:
        "How users reacted to what they got back. A correction or a handoff in the next turn counts as a miss.",
      weight: 0.35,
      effectiveWeight: 0.35,
      subScore: 92,
      deficit: 2.8,
      buckets: {
        ruined: 40,
        degraded: 80,
        clean: 880,
        denominator: 1000,
        denominatorLabel: "conversations we could read",
      },
      notMeasured: null,
      causes: [
        {
          key: "moment-frustration",
          title: "User is frustrated",
          severity: "ruined",
          evidence: "moment",
          sessions: 34,
          previousSessions: 28,
          costLabel: "$5 in those sessions",
          gain: 0.6,
          share: 0.8,
          trend: "worse",
          detail: "Read from what the user typed next, not from a model grading the answer.",
          destination: { label: "Behaviors", section: "behaviours" },
        },
        {
          key: "signal-guest-checkout",
          title: "Can't find order status for guest checkout",
          severity: "ruined",
          evidence: "signal",
          sessions: 28,
          previousSessions: 23,
          costLabel: "$4 in those sessions",
          gain: 0.5,
          share: 0.7,
          trend: "worse",
          detail: "5.8× more likely on sessions with no user id · 6 example sessions.",
          destination: { label: "Signals", section: "signals" },
        },
        {
          key: "moment-correction",
          title: "User corrects the agent",
          severity: "ruined",
          evidence: "moment",
          sessions: 31,
          previousSessions: 31,
          costLabel: "$5 in those sessions",
          gain: 0.4,
          share: 0.6,
          trend: "flat",
          detail: "The next turn restates the request rather than accepting the answer.",
          destination: { label: "Behaviors", section: "behaviours" },
        },
        {
          key: "moment-escalation",
          title: "Escalated to a human",
          severity: "ruined",
          evidence: "moment",
          sessions: 22,
          previousSessions: 26,
          costLabel: "$3 in those sessions",
          gain: 0.3,
          share: 0.4,
          trend: "better",
          detail: "Counted as a failure to resolve. A team that designs for handoff will want this configurable.",
          destination: { label: "Behaviors", section: "behaviours" },
        },
        {
          key: "moment-abandonment",
          title: "User abandons the session",
          severity: "ruined",
          evidence: "moment",
          sessions: 12,
          previousSessions: 12,
          costLabel: "$2 in those sessions",
          gain: 0.1,
          share: 0.2,
          trend: "flat",
          detail: "The conversation stops mid-task with no resolution.",
          destination: { label: "Behaviors", section: "behaviours" },
        },
        {
          key: "moment-weak",
          title: "Stalling or hesitation",
          severity: "degraded",
          evidence: "moment",
          sessions: 80,
          previousSessions: 94,
          costLabel: "$12 in those sessions",
          gain: 0.1,
          share: 0.1,
          trend: "better",
          detail: "The agent stalled or hedged, then the session got back on track.",
          destination: { label: "Behaviors", section: "behaviours" },
        },
      ],
    },
    {
      kind: "apdex",
      key: "reliability",
      label: "Reliability",
      question: "Did runs finish?",
      description:
        "Whether the run finished. A failure on the last turn counts in full, one the agent recovered from counts half.",
      weight: 0.3,
      effectiveWeight: 0.3,
      subScore: 43,
      deficit: 17.1,
      buckets: { ruined: 480, degraded: 408, clean: 312, denominator: 1200, denominatorLabel: "sessions" },
      notMeasured: null,
      causes: [
        {
          key: "terminal-error",
          title: "Last trace of the session errored",
          severity: "ruined",
          evidence: "mechanical",
          sessions: 318,
          previousSessions: 261,
          costLabel: "$47 in those sessions",
          gain: 4.8,
          share: 5.9,
          trend: "worse",
          detail: "The last turn errored, so the session ended on the failure instead of recovering from it.",
          destination: { label: "Sessions", section: "sessions" },
        },
        {
          key: "truncation",
          title: "Truncated: `length` on the final generation",
          severity: "ruined",
          evidence: "mechanical",
          sessions: 188,
          previousSessions: 154,
          costLabel: "$28 in those sessions",
          gain: 3.6,
          share: 4.1,
          trend: "worse",
          detail: "Raise the output limit on gpt-4o-mini. 154 of the 188 truncated sessions ran on that model.",
          quickWin: true,
          destination: { label: "Sessions", section: "sessions" },
        },
        {
          key: "tool-call-errors",
          title: "`list_tools` fails 63% of calls",
          severity: "degraded",
          evidence: "flagger",
          sessions: 268,
          previousSessions: 220,
          costLabel: "$39 in those sessions",
          gain: 2.1,
          share: 3.4,
          trend: "worse",
          detail: "The failures are spread evenly across the week rather than one bad afternoon.",
          destination: { label: "Tools", section: "tools" },
        },
        {
          key: "signal-gives-up",
          title: "Agent gives up after a failed tool call",
          severity: "ruined",
          evidence: "signal",
          sessions: 122,
          previousSessions: 122,
          costLabel: "$18 in those sessions",
          gain: 1.5,
          share: 1.9,
          trend: "flat",
          detail: "4.1× more likely on gpt-4o-mini · 6 example sessions.",
          destination: { label: "Signals", section: "signals" },
        },
        {
          key: "recovered-error",
          title: "Errored, then recovered",
          severity: "degraded",
          evidence: "mechanical",
          sessions: 340,
          previousSessions: 401,
          costLabel: "$50 in those sessions",
          gain: 0.6,
          share: 1.4,
          trend: "better",
          detail: "The agent hit an error and kept going, so these count half.",
          destination: { label: "Sessions", section: "sessions" },
        },
        {
          key: "no-output",
          title: "No assistant output at all",
          severity: "ruined",
          evidence: "mechanical",
          sessions: 74,
          previousSessions: 74,
          costLabel: "$11 in those sessions",
          gain: 0.3,
          share: 0.4,
          trend: "flat",
          detail: "The session holds LLM activity but never produced an assistant message.",
          destination: { label: "Sessions", section: "sessions" },
        },
      ],
    },
    {
      kind: "apdex",
      key: "process",
      label: "Process quality",
      question: "Did the agent take a sensible route?",
      description:
        "The route the agent took to its answer. A session can end well and still burn nine tool calls where two would do.",
      weight: 0.2,
      effectiveWeight: 0.2,
      subScore: 58,
      deficit: 8.4,
      buckets: {
        ruined: 300,
        degraded: 324,
        clean: 476,
        denominator: 1100,
        denominatorLabel: "sessions with tool calls",
      },
      notMeasured: null,
      causes: [
        {
          key: "signal-invoice-order",
          title: "Agent uses `invoice` tools in the wrong order",
          severity: "ruined",
          evidence: "signal",
          sessions: 210,
          previousSessions: 172,
          costLabel: "$31 in those sessions",
          gain: 2.4,
          share: 3.0,
          trend: "worse",
          detail: "3.2× more likely in refund sessions · 6 example sessions.",
          destination: { label: "Signals", section: "signals" },
        },
        {
          key: "thrashing",
          title: "Same tool and arguments repeated 3× in a row",
          severity: "ruined",
          evidence: "flagger",
          sessions: 164,
          previousSessions: 164,
          costLabel: "$24 in those sessions",
          gain: 2.0,
          share: 2.6,
          trend: "flat",
          detail: "The same call with the same arguments, three times running.",
          destination: { label: "Sessions", section: "sessions" },
        },
        {
          key: "tool-loop",
          title: "`search_docs` is 71% of the calls",
          severity: "degraded",
          evidence: "mechanical",
          sessions: 188,
          previousSessions: 154,
          costLabel: "$28 in those sessions",
          gain: 0.9,
          share: 1.6,
          trend: "worse",
          detail: "At least 5 tool calls in the session, one tool over 60% of them.",
          destination: { label: "Tools", section: "tools" },
        },
        {
          key: "undefined-tool",
          title: "Calls `get_user_email`, never defined",
          severity: "degraded",
          evidence: "mechanical",
          sessions: 64,
          previousSessions: 64,
          costLabel: "$9 in those sessions",
          gain: 0.5,
          share: 0.7,
          trend: "flat",
          detail: "Called but absent from the tool definitions sent with the request.",
          quickWin: true,
          destination: { label: "Tools", section: "tools" },
        },
        {
          key: "memory-thrash",
          title: "312 no-op rewrites, 44 reverted writes",
          severity: "degraded",
          evidence: "mechanical",
          sessions: 96,
          previousSessions: 113,
          costLabel: "$14 in those sessions",
          gain: 0.3,
          share: 0.5,
          trend: "better",
          detail: "Writes that changed nothing, or were undone later in the same session.",
          destination: { label: "Memory", section: "memory" },
        },
      ],
    },
    {
      kind: "curves",
      key: "efficiency",
      label: "Efficiency",
      question: "Did the agent spend more than it needed to?",
      description: "What the run cost along the way. This kind of waste stays waste even when the session went fine.",
      weight: 0.15,
      effectiveWeight: 0.15,
      subScore: 64,
      deficit: 5.4,
      notMeasured: null,
      metrics: [
        {
          key: "cost-drift",
          label: "Cost drift",
          value: "1.35×",
          good: "1.00×",
          poor: "1.50×",
          curve: 0.3,
          deficit: 2.1,
          trend: "worse",
          detail: "$0.149 per session against $0.110 over the trailing 28 days.",
          notMeasured: null,
          destination: { label: "Cost", section: "cost" },
        },
        {
          key: "cache-efficiency",
          label: "Cache efficiency",
          value: "60%",
          good: "80%",
          poor: "30%",
          curve: 0.6,
          deficit: 1.2,
          trend: "worse",
          detail: "Caching is on and serves 60% of input tokens.",
          notMeasured: null,
          destination: { label: "Cost", section: "cost" },
        },
        {
          key: "dead-tool-share",
          label: "Dead tool share",
          value: "35%",
          good: "20%",
          poor: "70%",
          curve: 0.7,
          deficit: 0.9,
          trend: "flat",
          detail: "12 of 34 definitions are never called, and are re-sent on every request. ~$3.8k/mo, estimated.",
          notMeasured: null,
          destination: { label: "Tools", section: "tools" },
        },
        {
          key: "latency-drift",
          label: "Latency drift",
          value: "1.10×",
          good: "1.00×",
          poor: "1.50×",
          curve: 0.8,
          deficit: 0.6,
          trend: "worse",
          detail: "p95 session duration 8.0s against 7.3s over the trailing 28 days.",
          notMeasured: null,
          destination: { label: "Sessions", section: "sessions" },
        },
        {
          key: "duplicate-tool-work",
          label: "Duplicate tool work",
          value: "4.6%",
          good: "2%",
          poor: "15%",
          curve: 0.8,
          deficit: 0.6,
          trend: "flat",
          detail: "`search_docs` ran with identical arguments 1,204 times.",
          notMeasured: null,
          destination: { label: "Tools", section: "tools" },
        },
      ],
    },
  ],
  safety: {
    confirmedFailures: 2,
    classifiedSessions: 412,
    classifiedShare: 0.34,
    exposureCount: 340,
    cap: 80,
    isBinding: false,
    deficit: 0,
    rateTestNote: "That is 0.49% of the sessions we checked. Past 1% the ceiling drops to 50.",
  },
}

const CODING_AGENT: AgentScoreSnapshot = {
  key: "coding",
  label: "Coding agent",
  summary: "Outcome not measured, safety cap binding",
  score: 80,
  uncappedScore: 88,
  previousScore: 80,
  intervalHalfWidth: 6,
  isProvisional: true,
  windowDays: 30,
  eligibleSessions: 604,
  minSessions: 30,
  history: [
    { day: "Jul 29", score: 88 },
    { day: "Aug 01", score: 87 },
    { day: "Aug 04", score: 86 },
    { day: "Aug 07", score: 85 },
    { day: "Aug 10", score: 84 },
    { day: "Aug 13", score: 80 },
    { day: "Aug 16", score: 80 },
    { day: "Aug 19", score: 80 },
    { day: "Aug 22", score: 80 },
    { day: "Aug 25", score: 80 },
    { day: "Aug 27", score: 80 },
  ],
  frozenAt: "Aug 27, 03:00 UTC",
  scoringVersion: "v1",
  dimensions: [
    {
      kind: "apdex",
      key: "outcome",
      label: "Outcome quality",
      question: "Did users get what they came for?",
      description:
        "How users reacted to what they got back. A correction or a handoff in the next turn counts as a miss.",
      weight: 0.35,
      effectiveWeight: null,
      subScore: null,
      deficit: null,
      buckets: null,
      notMeasured:
        "Only 6% of sessions had a person talking to the agent. We need 25% before this score would mean anything.",
      causes: [],
    },
    {
      kind: "apdex",
      key: "reliability",
      label: "Reliability",
      question: "Did runs finish?",
      description:
        "Whether the run finished. A failure on the last turn counts in full, one the agent recovered from counts half.",
      weight: 0.3,
      effectiveWeight: 0.46,
      subScore: 94,
      deficit: 2.8,
      buckets: { ruined: 22, degraded: 29, clean: 553, denominator: 604, denominatorLabel: "sessions" },
      notMeasured: null,
      causes: [
        {
          key: "terminal-error",
          title: "Last trace of the session errored",
          severity: "ruined",
          evidence: "mechanical",
          sessions: 22,
          previousSessions: 22,
          costLabel: "$43 in those sessions",
          gain: 1.0,
          share: 1.2,
          trend: "flat",
          detail: "The final turn errored, so the run ended on a failure.",
          destination: { label: "Sessions", section: "sessions" },
        },
        {
          key: "tool-call-errors",
          title: "`run_tests` fails 41% of calls",
          severity: "degraded",
          evidence: "flagger",
          sessions: 31,
          previousSessions: 25,
          costLabel: "$60 in those sessions",
          gain: 0.7,
          share: 0.9,
          trend: "worse",
          detail: "Most failures are timeouts, and the agent stops rather than retrying.",
          destination: { label: "Tools", section: "tools" },
        },
        {
          key: "truncation",
          title: "Truncated: `length` on the final generation",
          severity: "ruined",
          evidence: "mechanical",
          sessions: 14,
          previousSessions: 11,
          costLabel: "$27 in those sessions",
          gain: 0.6,
          share: 0.7,
          trend: "worse",
          detail: "Raise the output limit. All 14 ran on the same model.",
          quickWin: true,
          destination: { label: "Sessions", section: "sessions" },
        },
      ],
    },
    {
      kind: "apdex",
      key: "process",
      label: "Process quality",
      question: "Did the agent take a sensible route?",
      description:
        "The route the agent took to its answer. A session can end well and still burn nine tool calls where two would do.",
      weight: 0.2,
      effectiveWeight: 0.31,
      subScore: 87,
      deficit: 4.1,
      buckets: { ruined: 50, degraded: 57, clean: 481, denominator: 588, denominatorLabel: "sessions with tool calls" },
      notMeasured: null,
      causes: [
        {
          key: "thrashing",
          title: "Same tool and arguments repeated 3× in a row",
          severity: "ruined",
          evidence: "flagger",
          sessions: 50,
          previousSessions: 41,
          costLabel: "$97 in those sessions",
          gain: 1.7,
          share: 2.2,
          trend: "worse",
          detail: "The same call with the same arguments, three times running.",
          destination: { label: "Sessions", section: "sessions" },
        },
        {
          key: "tool-loop",
          title: "`read_file` is 71% of the calls",
          severity: "degraded",
          evidence: "mechanical",
          sessions: 88,
          previousSessions: 88,
          costLabel: "$171 in those sessions",
          gain: 0.9,
          share: 1.1,
          trend: "flat",
          detail: "At least 5 tool calls in the session, one tool over 60% of them.",
          destination: { label: "Tools", section: "tools" },
        },
        {
          key: "undefined-tool",
          title: "Calls `apply_patch`, never defined",
          severity: "degraded",
          evidence: "mechanical",
          sessions: 12,
          previousSessions: 12,
          costLabel: "$23 in those sessions",
          gain: 0.3,
          share: 0.4,
          trend: "flat",
          detail: "Called but absent from the tool definitions sent with the request.",
          quickWin: true,
          destination: { label: "Tools", section: "tools" },
        },
        {
          key: "memory-thrash",
          title: "18 no-op rewrites in AGENTS.md",
          severity: "degraded",
          evidence: "mechanical",
          sessions: 30,
          previousSessions: 35,
          costLabel: "$58 in those sessions",
          gain: 0.2,
          share: 0.4,
          trend: "better",
          detail: "Writes that changed nothing, or were undone later in the same session.",
          destination: { label: "Memory", section: "memory" },
        },
      ],
    },
    {
      kind: "curves",
      key: "efficiency",
      label: "Efficiency",
      question: "Did the agent spend more than it needed to?",
      description: "What the run cost along the way. This kind of waste stays waste even when the session went fine.",
      weight: 0.15,
      effectiveWeight: 0.23,
      subScore: 78,
      deficit: 5.1,
      notMeasured: null,
      metrics: [
        {
          key: "duplicate-tool-work",
          label: "Duplicate tool work",
          value: "6.4%",
          good: "2%",
          poor: "15%",
          curve: 0.66,
          deficit: 2.0,
          trend: "worse",
          detail: "`read_file` ran with identical arguments 3,410 times.",
          notMeasured: null,
          destination: { label: "Tools", section: "tools" },
        },
        {
          key: "dead-tool-share",
          label: "Dead tool share",
          value: "35%",
          good: "20%",
          poor: "70%",
          curve: 0.7,
          deficit: 1.7,
          trend: "flat",
          detail: "7 of 20 definitions are never called, and are re-sent on every request.",
          notMeasured: null,
          destination: { label: "Tools", section: "tools" },
        },
        {
          key: "latency-drift",
          label: "Latency drift",
          value: "1.06×",
          good: "1.00×",
          poor: "1.50×",
          curve: 0.88,
          deficit: 0.7,
          trend: "flat",
          detail: "p95 session duration 214s against 202s over the trailing 28 days.",
          notMeasured: null,
          destination: { label: "Sessions", section: "sessions" },
        },
        {
          key: "cost-drift",
          label: "Cost drift",
          value: "1.06×",
          good: "1.00×",
          poor: "1.50×",
          curve: 0.88,
          deficit: 0.7,
          trend: "worse",
          detail: "$1.94 per session against $1.83 over the trailing 28 days.",
          notMeasured: null,
          destination: { label: "Cost", section: "cost" },
        },
        {
          key: "cache-efficiency",
          label: "Cache efficiency",
          value: "—",
          good: "80%",
          poor: "30%",
          curve: null,
          deficit: null,
          trend: "flat",
          detail: "",
          notMeasured: "No cached tokens in this window, so the metric does not apply.",
          destination: { label: "Cost", section: "cost" },
        },
      ],
    },
  ],
  safety: {
    confirmedFailures: 1,
    classifiedSessions: 140,
    classifiedShare: 0.23,
    exposureCount: 12,
    cap: 80,
    isBinding: true,
    deficit: 8,
    rateTestNote: "That is 0.71% of the sessions we checked. Past 1% the ceiling drops to 50.",
  },
}

const PRE_LAUNCH_AGENT: AgentScoreSnapshot = {
  key: "prelaunch",
  label: "Pre-launch agent",
  summary: "Below the session floor: counts only, no number",
  score: null,
  uncappedScore: null,
  previousScore: null,
  intervalHalfWidth: null,
  isProvisional: false,
  windowDays: 30,
  eligibleSessions: 18,
  minSessions: 30,
  history: [],
  frozenAt: "Aug 27, 03:00 UTC",
  scoringVersion: "v1",
  dimensions: [
    {
      kind: "apdex",
      key: "outcome",
      label: "Outcome quality",
      question: "Did users get what they came for?",
      description:
        "How users reacted to what they got back. A correction or a handoff in the next turn counts as a miss.",
      weight: 0.35,
      effectiveWeight: null,
      subScore: null,
      deficit: null,
      buckets: null,
      notMeasured: null,
      causes: [
        {
          key: "moment-correction",
          title: "User corrects the agent",
          severity: "ruined",
          evidence: "moment",
          sessions: 2,
          previousSessions: null,
          costLabel: null,
          gain: null,
          share: null,
          trend: "flat",
          detail: "The next turn restates the request rather than accepting the answer.",
          destination: { label: "Behaviors", section: "behaviours" },
        },
      ],
    },
    {
      kind: "apdex",
      key: "reliability",
      label: "Reliability",
      question: "Did runs finish?",
      description:
        "Whether the run finished. A failure on the last turn counts in full, one the agent recovered from counts half.",
      weight: 0.3,
      effectiveWeight: null,
      subScore: null,
      deficit: null,
      buckets: null,
      notMeasured: null,
      causes: [
        {
          key: "truncation",
          title: "Truncated: `length` on the final generation",
          severity: "ruined",
          evidence: "mechanical",
          sessions: 6,
          previousSessions: null,
          costLabel: null,
          gain: null,
          share: null,
          trend: "flat",
          detail: "Raise the output limit on claude-sonnet-4-5.",
          quickWin: true,
          destination: { label: "Sessions", section: "sessions" },
        },
        {
          key: "tool-call-errors",
          title: "`fetch_invoice` fails 4 of 5 calls",
          severity: "degraded",
          evidence: "flagger",
          sessions: 5,
          previousSessions: null,
          costLabel: null,
          gain: null,
          share: null,
          trend: "flat",
          detail: "Most failures are timeouts, and the agent stops rather than retrying.",
          destination: { label: "Tools", section: "tools" },
        },
      ],
    },
    {
      kind: "apdex",
      key: "process",
      label: "Process quality",
      question: "Did the agent take a sensible route?",
      description:
        "The route the agent took to its answer. A session can end well and still burn nine tool calls where two would do.",
      weight: 0.2,
      effectiveWeight: null,
      subScore: null,
      deficit: null,
      buckets: null,
      notMeasured: null,
      causes: [
        {
          key: "thrashing",
          title: "Same tool and arguments repeated 3× in a row",
          severity: "ruined",
          evidence: "flagger",
          sessions: 3,
          previousSessions: null,
          costLabel: null,
          gain: null,
          share: null,
          trend: "flat",
          detail: "The same call with the same arguments, three times running.",
          destination: { label: "Sessions", section: "sessions" },
        },
        {
          key: "undefined-tool",
          title: "Calls `lookup_customer`, never defined",
          severity: "degraded",
          evidence: "mechanical",
          sessions: 2,
          previousSessions: null,
          costLabel: null,
          gain: null,
          share: null,
          trend: "flat",
          detail: "Called but absent from the tool definitions sent with the request.",
          quickWin: true,
          destination: { label: "Tools", section: "tools" },
        },
      ],
    },
    {
      kind: "curves",
      key: "efficiency",
      label: "Efficiency",
      question: "Did the agent spend more than it needed to?",
      description: "What the run cost along the way. This kind of waste stays waste even when the session went fine.",
      weight: 0.15,
      effectiveWeight: null,
      subScore: null,
      deficit: null,
      notMeasured: null,
      metrics: [
        {
          key: "dead-tool-share",
          label: "Dead tool share",
          value: "47%",
          good: "20%",
          poor: "70%",
          curve: null,
          deficit: null,
          trend: "flat",
          detail: "9 of 19 definitions are never called, and are re-sent on every request.",
          notMeasured: null,
          destination: { label: "Tools", section: "tools" },
        },
        {
          key: "cache-efficiency",
          label: "Cache efficiency",
          value: "—",
          good: "80%",
          poor: "30%",
          curve: null,
          deficit: null,
          trend: "flat",
          detail: "",
          notMeasured: "No cached tokens in this window, so the metric does not apply.",
          destination: { label: "Cost", section: "cost" },
        },
      ],
    },
  ],
  safety: {
    confirmedFailures: 0,
    classifiedSessions: 8,
    classifiedShare: 0.44,
    exposureCount: 0,
    cap: 100,
    isBinding: false,
    deficit: 0,
    rateTestNote:
      "We need 30 checked sessions before the 1% rule applies. A single confirmed leak still lowers the ceiling.",
  },
}

export const AGENT_SCORE_SNAPSHOTS: readonly AgentScoreSnapshot[] = [SUPPORT_AGENT, CODING_AGENT, PRE_LAUNCH_AGENT]

export const isAgentScoreSnapshotKey = (value: string): value is AgentScoreSnapshotKey =>
  AGENT_SCORE_SNAPSHOTS.some((snapshot) => snapshot.key === value)

export const findAgentScoreSnapshot = (key: string): AgentScoreSnapshot =>
  AGENT_SCORE_SNAPSHOTS.find((snapshot) => snapshot.key === key) ?? SUPPORT_AGENT

/** Ranks by recovered points when the score exists, by affected sessions when it does not. */
export const rankCauses = (causes: readonly ScoreCause[]): readonly ScoreCause[] =>
  [...causes].sort((a, b) => (b.gain ?? 0) - (a.gain ?? 0) || b.sessions - a.sessions)

export const apdexDimensions = (snapshot: AgentScoreSnapshot): readonly ApdexDimension[] =>
  snapshot.dimensions.filter((dimension): dimension is ApdexDimension => dimension.kind === "apdex")

export const efficiencyDimension = (snapshot: AgentScoreSnapshot): EfficiencyDimension | undefined =>
  snapshot.dimensions.find((dimension): dimension is EfficiencyDimension => dimension.kind === "curves")
