import { readFile, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { parseArgs } from "node:util"
import type { FlaggerStrategy } from "@domain/flaggers"
import {
  hashOptimizationCandidateText,
  type OptimizationCandidate,
  type OptimizationEvaluationResult,
  type OptimizationStopReason,
  type OptimizationTrajectory,
  Optimizer,
  splitOptimizationExamples,
} from "@domain/optimizations"
import { withAi } from "@platform/ai"
import { AIGenerateLive } from "@platform/ai-vercel"
import { GEPA_DEFAULT_REFLECTION_SIZE, GepaOptimizerLive } from "@platform/op-gepa"
import { Effect } from "effect"
import { render } from "ink"
import { createElement } from "react"
import {
  createAuditTrail,
  recordCandidate,
  recordIteration,
  recordScore,
  type SerializedAuditTrail,
  writeAuditTrail,
} from "../optimize/audit-trail.ts"
import {
  CandidateLoadFailure,
  callStrategyMethodWithTimeout,
  cleanupAllCandidates,
  loadFlaggerCandidate,
  StrategyMethodTimeoutError,
} from "../optimize/candidate-loader.ts"
import { createCostMeter } from "../optimize/cost-meter.ts"
import {
  callFlaggerProposer,
  DEFAULT_PROPOSER_MODELS,
  DEFAULT_PROPOSER_PROVIDER,
  type FlaggerProposerModel,
  type FlaggerProposerResult,
  type ProposerProvider,
} from "../optimize/flagger/proposer.ts"
import { renderFlaggerReportBody } from "../optimize/flagger/report.ts"
import { renderReport, writeReport } from "../optimize/report-renderer.ts"
import { loadPackageContext } from "../optimize/safety-scan.ts"
import {
  type Activity,
  type BenchmarkingPhase,
  OptimizeView,
  type OptimizeViewState,
  type RecentEvent,
} from "../optimize/ui/OptimizeView.tsx"
import { fixtureRowToTraceDetail } from "../runner/adapter.ts"
import { type Baseline, readBaseline } from "../runner/baseline.ts"
import { type BenchmarkRunPhase, enforceFreshness, loadFixture, runBenchmark } from "../runner/benchmark.ts"
import { createTokenMeter } from "../runner/meter.ts"
import { meteringAIGenerateLive } from "../runner/metering-ai.ts"
import type { Metrics, Prediction } from "../runner/metrics.ts"
import { computeCost } from "../runner/pricing.ts"
import { stratifiedSample } from "../runner/sample.ts"
import { type BenchmarkTarget, resolveTargets, TARGETS, targetPath } from "../runner/targets.ts"
import type { FixtureRow } from "../types.ts"
import { formatCostUsd, formatPercent } from "../ui/format.ts"
import type { ReportData } from "../ui/types.ts"

const PKG_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..")
const OPTIMIZATIONS_ROOT = join(PKG_ROOT, "optimizations")
const BASELINES_ROOT = join(PKG_ROOT, "baselines")

const DEFAULT_SEED = 0xbeefcafe
const TRAIN_RATIO = 0.8
const VALIDATION_RATIO = 0.2
const STRATEGY_METHOD_TIMEOUT_MS = 5000
const MAX_TRAJECTORIES_PER_PROPOSE = 30
// Hard cap on candidate source length. Anchored to baseline (not parent)
// so total drift across the run is bounded rather than geometric.
//
// Hybrid formula: cap = max(baseline × MULTIPLIER, baseline + MIN_HEADROOM).
// The multiplier dominates for normal-sized strategy files (~13K-char
// jailbreaking flagger → 20K cap); the additive floor dominates for
// stubs and tiny baselines (a 500-char stub at 1.5× would cap at 750
// chars, killing any meaningful rewrite — the floor lifts that to
// 500 + 4096 = 4596 chars, room for ~100 LOC of headroom regardless of
// how small the starting point is). Both numbers are tunable:
//   - bump MULTIPLIER (e.g. 1.75) if legitimate rewrites get blocked on
//     large baselines.
//   - bump MIN_HEADROOM if even small files need more room to grow a new
//     feature.
//   - lower MULTIPLIER (e.g. 1.25) if file bloat persists.
const CANDIDATE_SIZE_BUDGET_MULTIPLIER = 1.5
const CANDIDATE_SIZE_BUDGET_MIN_HEADROOM_BYTES = 4096

interface OptimizeArgs {
  readonly targetId: string
  readonly budgetTimeSeconds: number | undefined
  readonly budgetTokens: number | undefined
  readonly budgetStagnation: number | undefined
  readonly reflectionSize: number | undefined
  readonly sample: number | undefined
  readonly seed: number
  readonly proposerNotesPath: string | null
  readonly proposerProvider: ProposerProvider
  readonly proposerModel: string
  readonly verbose: boolean
  readonly staleOk: boolean
}

interface PreFilterSignal {
  readonly kind: "matched" | "no-match" | "ambiguous" | "no-required-context" | "no-detect-method"
  readonly feedback?: string
}

interface RowEvaluation {
  readonly predicted: boolean
  readonly phase: Prediction["phase"]
  readonly costUsd: number
  readonly tokensTotal: number
  readonly preFilter: PreFilterSignal
  readonly llmVerdict: boolean | null
  readonly errorMessage: string | null
}

const main = async (): Promise<void> => {
  const args = await parseCliArgs()
  const target = pickTarget(args.targetId)
  if (!target.optimization || target.optimization.candidateKind !== "ts-module") {
    throw new Error(
      `Target ${target.id} does not declare a ts-module optimization config. Only flagger targets are supported in v1.`,
    )
  }

  // Pre-flight fixture freshness check. Without this, a stale fixture
  // (mapper file changed since the local cache was generated) is silent
  // for the entire optimizer run — `loadFixture` doesn't enforce
  // freshness, only `runBenchmark` does. The post-improvement
  // `runBenchmark` call would then bail AFTER we'd already written the
  // winner to the strategy file, leaving the working tree in a half-
  // adopted state. Catching it here aborts in seconds, before we
  // touch any files. `--stale-ok` opts out for users who deliberately
  // want to optimize against an out-of-date fixture.
  //
  // Wrap so a freshness mismatch looks like an actionable user error
  // (formatted, no stack trace) instead of a Node "uncaught exception"
  // dump that reads like a bug. Other failures from this point on are
  // genuine errors and keep their stack traces.
  try {
    await enforceFreshness(target, args.staleOk)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`\n${ansi.red("✗ Cannot start optimization")}\n`)
    console.error(`  ${message}\n`)
    process.exit(1)
  }

  const cfg = target.optimization
  const baselinePath = join(BASELINES_ROOT, `${targetPath(target.id)}.json`)
  const existingBaseline = await readBaseline(baselinePath)
  let priorBaseline: Baseline
  if (existingBaseline === null) {
    // Bootstrap path: no baseline JSON committed yet for this target. Run
    // the benchmark in-process once to establish one. Ink isn't mounted
    // yet here, so phase events go to stdout — terse one-line updates the
    // user can read while the run completes. The optimizer needs a
    // baseline to compare against (and to feed "before" metrics into the
    // report).
    console.log(`\n=== ${target.id} ===\nno committed baseline at ${baselinePath}\nrunning benchmark to establish one…`)
    await runBenchmark(target, {
      sample: undefined,
      seed: undefined,
      staleOk: args.staleOk,
      updateBaseline: true,
      concurrency: undefined,
      onPhase: logBenchmarkPhase(target.id),
    })
    const established = await readBaseline(baselinePath)
    if (established === null) {
      console.error(`baseline JSON still missing at ${baselinePath} after baseline run; aborting.`)
      process.exit(1)
    }
    priorBaseline = established
  } else {
    priorBaseline = existingBaseline
  }

  const rows = await loadFixture(target)
  const sampledRows = args.sample !== undefined ? stratifiedSample(rows, args.sample, args.seed) : rows
  const rowsById = new Map(sampledRows.map((r) => [r.id, r]))

  const baselineFileText = await readFile(cfg.strategyFilePath, "utf8")
  const baselineHash = await hashOptimizationCandidateText(baselineFileText)
  const baselineCandidate: OptimizationCandidate = {
    componentId: `flagger-strategy:${cfg.flaggerSlug}`,
    text: baselineFileText,
    hash: baselineHash,
  }
  const candidateMaxBytes = Math.max(
    Math.floor(baselineFileText.length * CANDIDATE_SIZE_BUDGET_MULTIPLIER),
    baselineFileText.length + CANDIDATE_SIZE_BUDGET_MIN_HEADROOM_BYTES,
  )

  const operatorNotesPath = args.proposerNotesPath ?? defaultProposerNotesPath(target.id)
  const operatorNotes = await tryLoadOperatorNotes(operatorNotesPath)

  const packageContext = await loadPackageContext({
    strategyFilePath: cfg.strategyFilePath,
    packageJsonPath: cfg.packageJsonPath,
  })

  const startedAt = new Date()
  const dataset = splitOptimizationExamples({
    examples: sampledRows.map((r) => ({ id: r.id, label: r.expected.matched ? "positive" : "negative" })),
    seed: args.seed,
    trainRatio: TRAIN_RATIO,
    validationRatio: VALIDATION_RATIO,
  })

  // Preflight: GEPA's pareto-front candidate selector asserts on a
  // non-empty val set. The split's strict minimum is 2 rows (1 train +
  // 1 val); below that the optimizer crashes deep in Python with an
  // unhelpful traceback. We refuse early with an actionable message.
  // Practical minimum for any signal is much higher (~20+).
  if (dataset.trainset.length === 0 || dataset.valset.length === 0) {
    console.error(`\n=== ${target.id} ===`)
    console.error(
      `cannot start optimization: dataset split produced train=${dataset.trainset.length} val=${dataset.valset.length} from ${sampledRows.length} rows.`,
    )
    console.error(
      `GEPA needs both a non-empty trainset AND valset to run pareto-front candidate selection. Strict minimum is --sample 2 (1 train + 1 val); --sample 20+ is recommended for any meaningful signal.`,
    )
    process.exit(1)
  }

  const proposerModel: FlaggerProposerModel = {
    provider: args.proposerProvider,
    model: args.proposerModel,
  }

  console.log(`\n=== ${target.id} ===`)
  console.log(
    `starting optimization · rows=${sampledRows.length} (train=${dataset.trainset.length} val=${dataset.valset.length}) · seed=${toHex(args.seed)}`,
  )
  console.log(`proposer · ${proposerModel.provider}/${proposerModel.model}`)
  if (operatorNotes !== null) console.log(`loaded operator notes from ${operatorNotesPath}`)

  // Verbose debug log: streams full prompts, responses, per-row evaluations,
  // and scan rejections to a file the dev can `tail -f`. Plain text with
  // section headers — readable, easy to grep. Off by default; enabled by
  // `--verbose`. Path is printed before ink mounts so the user can switch
  // to a second terminal and tail it.
  const debugLogPath = join(OPTIMIZATIONS_ROOT, targetPath(target.id), `${formatTimestamp(startedAt)}-debug.log`)
  const debug = await createDebugLog({ enabled: args.verbose, path: debugLogPath })
  if (args.verbose) {
    console.log(`verbose log: tail -f ${debugLogPath}`)
    debug.section("optimization start")
    debug.kv("target", target.id)
    debug.kv("sample", String(args.sample ?? "full"))
    debug.kv("seed", toHex(args.seed))
    debug.kv("budget.time", args.budgetTimeSeconds === undefined ? "∞" : `${args.budgetTimeSeconds}s`)
    debug.kv("budget.tokens", args.budgetTokens === undefined ? "∞" : args.budgetTokens.toLocaleString())
    debug.kv("budget.stagnation", args.budgetStagnation === undefined ? "default" : `${args.budgetStagnation} iters`)
    debug.kv("reflection.size", args.reflectionSize === undefined ? "default" : String(args.reflectionSize))
    debug.kv("trainset", String(dataset.trainset.length))
    debug.kv("valset", String(dataset.valset.length))
    debug.kv("operator-notes", operatorNotes === null ? "(none)" : `${operatorNotes.length} chars`)
  }

  const auditTrail = createAuditTrail()
  recordCandidate(auditTrail, baselineCandidate)

  const costMeter = createCostMeter()

  const trajectoryStore = new Map<string, OptimizationTrajectory>()
  const evaluatedHashes = new Set<string>()
  const proposerCallCount = { value: 0 }

  // Mutable view state: read 10×/sec by the ink component via getState().
  // We mutate fields in place; the component renders from a fresh
  // Date.now() snapshot so spinners + elapsed time keep ticking even when
  // no orchestrator action has happened recently.
  const viewState: { current: OptimizeViewState } = {
    current: {
      targetId: target.id,
      sample: args.sample ?? null,
      seed: args.seed,
      budgetSeconds: args.budgetTimeSeconds,
      startedAtMs: startedAt.getTime(),
      activity: { kind: "starting" },
      iterations: [],
      cost: costMeter.snapshot(),
      proposerCallCount: 0,
      recentEvents: [],
      proposerModel: proposerModel.model,
    },
  }
  const setActivity = (activity: Activity): void => {
    viewState.current = { ...viewState.current, activity, cost: costMeter.snapshot() }
  }
  const refreshIterations = (): void => {
    viewState.current = {
      ...viewState.current,
      iterations: [...auditTrail.iterations],
      cost: costMeter.snapshot(),
      proposerCallCount: proposerCallCount.value,
    }
  }
  const pushEvent = (text: string, tone: RecentEvent["tone"] = "info"): void => {
    const evt: RecentEvent = { atMs: Date.now(), text, tone }
    // Keep last 20 in state; the view caps display at 5.
    const next = [...viewState.current.recentEvents, evt].slice(-20)
    viewState.current = { ...viewState.current, recentEvents: next }
  }

  // In-iteration progress: GEPA's `evaluate` callback fires once per row,
  // and a single iteration evaluates ~train+val rows + one propose call.
  // Without per-row ticks the terminal looks dead for minutes. We track
  // per-candidate-hash progress and reflect it via `setActivity` to drive
  // the live ink view (rolling spinner + row counter + phase counts).
  let evalCurrentHash: string | null = null
  let evalRowsForCurrent = 0
  let evalPhaseCounts: Record<string, number> = {}
  // Per-row eval logging is one character per row appended to a single
  // line. The line opens with a timestamped header on each new candidate
  // hash; subsequent rows for the same candidate just append their dots.
  // The line is closed implicitly by the next `debug.section` (which
  // writes a leading newline). Char map (chosen so a glance tells you
  // whether the deterministic layer is carrying its weight or the run is
  // LLM-heavy):
  //   .   deterministic-{match,no-match} — resolved without an LLM call
  //   o   llm-{match,no-match} — LLM was invoked (judge cost incurred)
  //   !   error or schema-mismatch (LLM produced unparseable output)
  //   R   candidate-rejected (compile/import/scan failure — same hash for
  //       every row of the broken candidate; the line will be all R's)
  // Keeps a 1500-row eval batch to a single tail-able line instead of
  // 1500 timestamped detail lines. Per-row detail still lives in the
  // audit JSON.
  const tickEvaluateStart = (hash: string): void => {
    if (hash !== evalCurrentHash) {
      evalCurrentHash = hash
      evalRowsForCurrent = 0
      evalPhaseCounts = {}
      debug.dot(`\n[${new Date().toISOString().slice(11, 23)}] evaluate ${hash.slice(0, 8)}: `)
    }
  }
  const recordEvaluateDone = (phase: string): void => {
    evalRowsForCurrent += 1
    evalPhaseCounts = { ...evalPhaseCounts, [phase]: (evalPhaseCounts[phase] ?? 0) + 1 }
    setActivity({
      kind: "evaluate",
      hash: evalCurrentHash ?? "",
      rowsDone: evalRowsForCurrent,
      phaseCounts: evalPhaseCounts,
    })
    debug.dot(charForEvalPhase(phase))
  }

  // Bundle diagnostics sink: routes per-candidate compile output to the
  // verbose debug log so the live ink TUI stays clean. Fires once per
  // unique candidate hash (the loader caches by hash). Only wired up when
  // --verbose is set — passing onBundle unconditionally would still pay
  // the cost of computeBundleDiff (mkdtemp + writes + sync `git diff`)
  // per candidate even when the diagnostic output is dropped.
  const logBundle = args.verbose
    ? (hash: string) => (info: { inputBytes: number; outputBytes: number; diff: string }) => {
        debug.section(`bundle ${hash.slice(0, 8)}`)
        debug.kv("input bytes", String(info.inputBytes))
        debug.kv("output bytes", String(info.outputBytes))
        if (info.diff.length > 0) debug.text(info.diff)
        else debug.text("(no textual differences)")
      }
    : null

  const ink = render(createElement(OptimizeView, { getState: () => viewState.current }))

  const evaluate = async (input: {
    readonly candidate: OptimizationCandidate
    readonly example: { readonly id: string }
  }): Promise<OptimizationEvaluationResult> => {
    const row = rowsById.get(input.example.id)
    if (row === undefined) throw new Error(`evaluate: unknown row ${input.example.id}`)

    // Open the dot stream for this candidate's batch *before* the candidate
    // load — we want a header line even when every row will be rejected
    // (load failed), and the same hash should produce a single line full
    // of `R`s rather than starting fresh on each row.
    tickEvaluateStart(input.candidate.hash)

    let strategy: FlaggerStrategy
    try {
      const onBundle = logBundle?.(input.candidate.hash)
      const loaded = await loadFlaggerCandidate({
        hash: input.candidate.hash,
        text: input.candidate.text,
        exportName: cfg.exportName,
        context: packageContext,
        maxBytes: candidateMaxBytes,
        ...(onBundle ? { onBundle } : {}),
      })
      strategy = loaded.shape
    } catch (err) {
      // Stage-2/3 failure: candidate fails to compile/import or lacks shape.
      // Score 0 with rejection details surfaced into trajectory feedback so
      // the next reflection round sees *why* this candidate failed.
      // Candidate-rejected trajectories ALWAYS score 0 / passed false,
      // regardless of expected.matched. A broken candidate can't be
      // "accidentally correct" on negative rows — the strategy never
      // executed; we just substituted a default no-match prediction. We
      // want the proposer to see uniform rejection feedback across all
      // rows so it focuses on the rejection.reason rather than the
      // (meaningless) per-row predictions.
      const failure = err instanceof CandidateLoadFailure ? err : null
      const trajectory: OptimizationTrajectory = {
        id: input.example.id,
        conversationText: renderConversation(row),
        feedback: JSON.stringify({
          phase: "candidate-rejected",
          rejection: failure
            ? { stage: failure.stage, reason: failure.reason }
            : { stage: "import", reason: err instanceof Error ? err.message : String(err) },
        }),
        expectedPositive: row.expected.matched,
        predictedPositive: false,
        passed: false,
        score: 0,
        totalTokens: 0,
      }
      trajectoryStore.set(trajectory.id, trajectory)
      recordScore(auditTrail, input.candidate, {
        exampleId: trajectory.id,
        score: 0,
        phase: "candidate-rejected",
      })
      debug.dot("R")
      return { trajectory }
    }

    const evaluation = await evaluateRow({
      strategy,
      row,
      target,
    })
    if (evaluation.costUsd > 0) costMeter.addJudgeUsd(evaluation.costUsd)
    recordEvaluateDone(evaluation.phase)

    const expected = row.expected.matched
    const score: 0 | 1 = evaluation.predicted === expected ? 1 : 0
    const trajectory: OptimizationTrajectory = {
      id: input.example.id,
      conversationText: renderConversation(row),
      feedback: JSON.stringify({
        expected,
        predicted: evaluation.predicted,
        phase: evaluation.phase,
        tags: row.tags,
        preFilter: evaluation.preFilter,
        llmVerdict: evaluation.llmVerdict,
        ...(evaluation.errorMessage !== null ? { errorMessage: evaluation.errorMessage } : {}),
      }),
      expectedPositive: expected,
      predictedPositive: evaluation.predicted,
      passed: score === 1,
      score,
      totalTokens: evaluation.tokensTotal,
    }
    trajectoryStore.set(trajectory.id, trajectory)
    evaluatedHashes.add(input.candidate.hash)
    recordScore(auditTrail, input.candidate, {
      exampleId: trajectory.id,
      score,
      phase: evaluation.phase,
    })
    return { trajectory }
  }

  const propose = async (input: {
    readonly candidate: OptimizationCandidate
    readonly context: readonly OptimizationTrajectory[]
  }): Promise<OptimizationCandidate> => {
    // GEPA-native single-shot propose. No retry loop here — the framework
    // already handles "candidate failed, learn from it" via trajectories:
    // the candidate-loader scans/compiles at evaluate time, throws on
    // rejection, the evaluate callback (above) catches and emits a
    // trajectory with `phase: "candidate-rejected"` + `rejection.reason`
    // in feedback. GEPA's outer loop carries those trajectories into the
    // next propose call, so the proposer adapts across iterations the
    // same way it adapts to classification failures. Adding an inner
    // retry loop here only duplicates that mechanism.
    const trajectoriesForPropose = chooseProposeContext(input.context)
    const attemptStartedAtMs = Date.now()
    setActivity({ kind: "proposing", phase: "preparing", attemptStartedAtMs })
    pushEvent("propose started", "info")

    debug.section(`propose (parent ${input.candidate.hash.slice(0, 8)})`)
    debug.kv("trajectories", `${trajectoriesForPropose.length} (max ${MAX_TRAJECTORIES_PER_PROPOSE} sent)`)
    debug.kv("parent file", `${input.candidate.text.length} chars (see audit JSON for full text)`)

    const proposeResult: FlaggerProposerResult = await Effect.runPromise(
      callFlaggerProposer({
        currentFileText: input.candidate.text,
        currentCandidate: input.candidate,
        trajectories: trajectoriesForPropose,
        operatorNotes,
        flaggerSlug: cfg.flaggerSlug,
        exportName: cfg.exportName,
        maxTrajectories: MAX_TRAJECTORIES_PER_PROPOSE,
        maxBytes: candidateMaxBytes,
        baselineBytes: baselineFileText.length,
        proposerModel,
        onPhase: (phase) => {
          setActivity({ kind: "proposing", phase, attemptStartedAtMs })
          debug.tick(`phase: ${phase}`)
        },
      }).pipe(withAi(AIGenerateLive)),
    )

    proposerCallCount.value++
    costMeter.addProposerUsd(proposeResult.costUsd)

    const elapsed = Math.floor((Date.now() - attemptStartedAtMs) / 1000)
    debug.kv("elapsed", `${elapsed}s`)
    debug.kv("input tokens", String(proposeResult.inputTokens))
    debug.kv("output tokens", String(proposeResult.outputTokens))
    debug.kv("reasoning tokens", String(proposeResult.reasoningTokens))
    debug.kv("cost", formatCostUsd(proposeResult.costUsd))

    // Proposer-side failure path. Two flavors, distinguished by the prefix
    // the proposer's catchCause sentinel sets on `reasoning`:
    //   [patch-apply-error]  the model returned an edits list but at least
    //                        one find/replace failed to apply uniquely.
    //                        Audit stage: "patch-apply". The model can fix
    //                        this next iteration by picking better anchors.
    //   [proposer-error]     anything else (Anthropic API failure, schema
    //                        validation, hashing). Audit stage: "proposer-error".
    //
    // Both paths throw to skip the eval phase. Throwing here propagates
    // through JSON-RPC into the Python adapter, where
    // reflective_mutation.propose catches the exception and returns None.
    // GEPA then `continue`s to the next iteration — crucially, it skips
    // the new-candidate subsample eval AND the full val eval that would
    // otherwise burn ~5+187 judge calls on a parent-equivalent candidate.
    // The parent's subsample eval already ran before propose was called;
    // that cost is unavoidable.
    //
    // The audit record goes in *before* the throw so the user can see
    // what the proposer error said. Counts toward stagnation: a series
    // of AI errors will end the run with stopReason=stagnation, which is
    // the right behavior — there's no signal to optimize on without
    // working proposals.
    if (proposeResult.candidate.hash === "" || proposeResult.candidate.text === "") {
      const truncated = proposeResult.reasoning.replace(/\s+/g, " ").slice(0, 100)
      const isPatchApply = proposeResult.reasoning.startsWith("[patch-apply-error]")
      const stage = isPatchApply ? "patch-apply" : "proposer-error"
      const eventLabel = isPatchApply ? "patch-apply error" : "AI error"
      pushEvent(`${eventLabel} (${elapsed}s): ${truncated}`, "err")
      debug.text(`--- ${stage} (full) ---`)
      debug.text(proposeResult.reasoning)
      recordIteration(auditTrail, {
        iteration: auditTrail.iterations.length + 1,
        parentHash: input.candidate.hash,
        childHash: input.candidate.hash,
        proposerReasoning: proposeResult.reasoning,
        proposerCostUsd: proposeResult.costUsd,
        proposerAttempts: 1,
        changedDeclarations: [],
        rejection: { stage, reason: proposeResult.reasoning },
        timestampMs: Date.now(),
      })
      refreshIterations()
      throw new Error(`proposer ${eventLabel}: ${truncated}`)
    }

    debug.text("--- proposer reasoning ---")
    debug.text(proposeResult.reasoning)
    // Compact per-edit summary instead of dumping the full post-edit file
    // (the audit JSON has the full text + hash; tail -f wants something
    // scannable). One line per edit: a preview of the find anchor, plus
    // line/char delta vs. the replace. Total file delta is on the closing
    // line so the run-by-run growth is visible at a glance.
    debug.text(`--- proposer edits (${proposeResult.edits.length}) ---`)
    for (let i = 0; i < proposeResult.edits.length; i++) {
      const edit = proposeResult.edits[i]
      if (edit === undefined) continue
      debug.text(`[${i + 1}] ${formatEditSummary(edit)}`)
    }
    const totalDeltaChars = proposeResult.candidate.text.length - input.candidate.text.length
    const totalDeltaSign = totalDeltaChars >= 0 ? "+" : ""
    debug.kv(
      "result",
      `${proposeResult.candidate.text.length} chars (${totalDeltaSign}${totalDeltaChars}) · hash ${proposeResult.candidate.hash.slice(0, 8)} (full text in audit JSON)`,
    )

    // Pass the candidate through unconditionally — no propose-time scan,
    // no rejection short-circuit. candidate-loader.ts runs the full static
    // scan (including the regex DoS sniff) + compile + import + shape
    // probe at evaluate time; any failure throws CandidateLoadFailure,
    // which the evaluate callback catches and emits as per-row
    // `phase: "candidate-rejected"` trajectories with the rejection reason
    // in feedback. The next propose call sees those (via
    // `chooseProposeContext`) and adapts. Centralizing static checks at
    // evaluate time keeps the rejection signal flowing through the
    // standard candidate-rejected feedback path the proposer is built to
    // learn from.
    recordCandidate(auditTrail, proposeResult.candidate)
    recordIteration(auditTrail, {
      iteration: auditTrail.iterations.length + 1,
      parentHash: input.candidate.hash,
      childHash: proposeResult.candidate.hash,
      proposerReasoning: proposeResult.reasoning,
      proposerCostUsd: proposeResult.costUsd,
      proposerAttempts: 1,
      changedDeclarations: diffTopLevelDeclarations(input.candidate.text, proposeResult.candidate.text),
      rejection: null,
      timestampMs: Date.now(),
    })
    pushEvent(`propose ok (${elapsed}s) → ${proposeResult.candidate.hash.slice(0, 8)}`, "ok")
    refreshIterations()
    return proposeResult.candidate
  }

  const hasBudget =
    args.budgetTimeSeconds !== undefined || args.budgetTokens !== undefined || args.budgetStagnation !== undefined
  const optimizeProgram = Effect.gen(function* () {
    const optimizer = yield* Optimizer
    return yield* optimizer.optimize({
      baselineCandidate,
      dataset,
      ...(hasBudget
        ? {
            budget: {
              ...(args.budgetTimeSeconds !== undefined ? { time: args.budgetTimeSeconds } : {}),
              ...(args.budgetTokens !== undefined ? { tokens: args.budgetTokens } : {}),
              ...(args.budgetStagnation !== undefined ? { stagnation: args.budgetStagnation } : {}),
            },
          }
        : {}),
      ...(args.reflectionSize !== undefined ? { reflectionSize: args.reflectionSize } : {}),
      evaluate,
      propose,
    })
  }).pipe(Effect.provide(GepaOptimizerLive))

  const optimizeResult = await Effect.runPromise(optimizeProgram).catch(async (cause: unknown) => {
    ink.unmount()
    await ink.waitUntilExit()
    console.error(`optimization failed:`, cause)
    // Best-effort: dump partial audit so the dev can see which iterations
    // ran and what the proposer returned, even on a crash.
    try {
      const crashDir = join(OPTIMIZATIONS_ROOT, targetPath(target.id))
      const crashPath = join(crashDir, `${formatTimestamp(new Date())}-crash.json`)
      await writeAuditTrail(crashPath, {
        version: 1,
        targetId: target.id,
        startedAt: startedAt.toISOString(),
        finishedAt: new Date().toISOString(),
        baselineHash: baselineCandidate.hash,
        winnerHash: baselineCandidate.hash,
        budget: null,
        stopReason: null,
        engineTotalIterations: null,
        engineProposeCalls: null,
        sampleSize: args.sample ?? null,
        seed: args.seed,
        operatorNotes,
        iterations: auditTrail.iterations,
        candidates: [...auditTrail.candidates.values()],
      })
      console.error(`partial audit written to ${crashPath}`)
    } catch (writeErr) {
      console.error(`could not write partial audit:`, writeErr)
    }
    throw cause
  })

  const winner = optimizeResult.optimizedCandidate
  const stopReason: OptimizationStopReason | null = optimizeResult.stopReason ?? null
  const engineTotalIterations: number | null = optimizeResult.totalIterations ?? null
  const engineProposeCalls: number | null = optimizeResult.proposeCalls ?? null
  const noImprovement = winner.hash === baselineCandidate.hash

  // Adopt-with-validation: GEPA's val-set acceptance is computed against
  // the in-memory baselineCandidate (= the strategy file on disk at run
  // start), which can drift from the committed baseline JSON metrics. If
  // the file on disk was a stub or an unrelated branch state, GEPA will
  // happily promote a "winner" that's worse than the committed reference.
  // To guard against this we run a full benchmark pass against the winner
  // BEFORE writing anything to disk, comparing F1 to the saved
  // priorBaseline. If the validation regresses, the strategy file and
  // baseline JSON are untouched.
  //
  // The validation pass uses `strategyOverride` so it evaluates the
  // winner candidate text directly, not the imported flagger module
  // (Node's static-import cache holds the version that was on disk at
  // process start; writeFile can't invalidate that cache).
  //
  // Ink stays mounted across both passes so the user sees live per-row
  // progress instead of a frozen terminal.
  let postBaseline: Baseline | null = null
  // Captured from the validation pass so the banner can show real winner
  // metrics even when adoption was refused. Without this, the banner
  // would fall back to baseline metrics for the "winner" column and
  // hide the regression that triggered the refusal.
  let winnerValidation: ReportData | null = null
  let winnerRejection: { readonly winnerF1: number; readonly baselineF1: number } | null = null
  if (!noImprovement) {
    pushEvent(`winner found · ${winner.hash.slice(0, 8)} ≠ baseline ${baselineCandidate.hash.slice(0, 8)}`, "ok")

    // Load the winner candidate as an in-memory strategy. Reuses the
    // optimizer's candidate-loader so the static scan + compile + import
    // + shape probe run again here — if the winner somehow loads in
    // optimization but not at adoption time (race, fs flakiness), we
    // surface that as an error rather than silently proceeding.
    const winnerOnBundle = logBundle?.(winner.hash)
    const loaded = await loadFlaggerCandidate({
      hash: winner.hash,
      text: winner.text,
      exportName: cfg.exportName,
      context: packageContext,
      maxBytes: candidateMaxBytes,
      ...(winnerOnBundle ? { onBundle: winnerOnBundle } : {}),
    })
    const winnerStrategy = loaded.shape

    setActivity({
      kind: "benchmarking",
      label: "validating winner",
      phase: { kind: "checking-freshness" },
    })
    winnerValidation = await runBenchmark(target, {
      sample: undefined,
      seed: undefined,
      staleOk: args.staleOk,
      updateBaseline: false,
      concurrency: undefined,
      strategyOverride: winnerStrategy,
      onPhase: (phase) => {
        const mapped = mapBenchmarkPhase(phase)
        if (mapped !== null) {
          setActivity({ kind: "benchmarking", label: "validating winner", phase: mapped })
        }
      },
    })

    const winnerF1 = winnerValidation.metrics.f1
    const baselineF1 = priorBaseline.metrics.f1
    // Strict comparison: any regression vs the committed baseline blocks
    // adoption. Tolerance of 0 because GEPA already paid the cost of
    // finding an "improvement" on its val split — if that "improvement"
    // doesn't hold against the saved baseline, something is wrong (most
    // commonly: working-tree strategy file diverged from the committed
    // baseline reference). Floating-point noise on F1 is at the 1e-15
    // level, well below this comparison.
    if (winnerF1 < baselineF1) {
      winnerRejection = { winnerF1, baselineF1 }
      const deltaPp = ((winnerF1 - baselineF1) * 100).toFixed(1)
      pushEvent(
        `✗ winner regressed: F1 ${(winnerF1 * 100).toFixed(1)}% < baseline ${(baselineF1 * 100).toFixed(1)}% (${deltaPp}pp). Strategy file unchanged.`,
        "err",
      )
    } else {
      // Adopt: write the strategy file, then refresh the baseline JSON.
      // The refresh pass also uses `strategyOverride` because Node's
      // module cache still has the pre-write strategy.
      await writeFile(cfg.strategyFilePath, winner.text)
      pushEvent(`wrote strategy file ${cfg.strategyFilePath}`, "info")
      setActivity({
        kind: "benchmarking",
        label: "refreshing baseline",
        phase: { kind: "checking-freshness" },
      })
      await runBenchmark(target, {
        sample: undefined,
        seed: undefined,
        staleOk: args.staleOk,
        updateBaseline: true,
        concurrency: undefined,
        strategyOverride: winnerStrategy,
        onPhase: (phase) => {
          const mapped = mapBenchmarkPhase(phase)
          if (mapped !== null) {
            setActivity({ kind: "benchmarking", label: "refreshing baseline", phase: mapped })
          }
        },
      })
      postBaseline = await readBaseline(baselinePath)
      if (postBaseline === null) {
        ink.unmount()
        await ink.waitUntilExit()
        console.error(`expected baseline JSON at ${baselinePath} after baseline refresh; not found`)
        process.exit(1)
      }
    }
  }

  setActivity({
    kind: "done",
    message: `optimization complete · ${proposerCallCount.value} propose calls · cost ${formatCostUsd(costMeter.totalUsd())}`,
  })
  refreshIterations()
  ink.unmount()
  await ink.waitUntilExit()

  const baselineMetrics = priorBaseline.metrics
  // Winner metrics priority: adopted baseline JSON > validation pass >
  // baseline (no winner case). When adoption was refused, the validation
  // report has the actual winner metrics — using them in the banner makes
  // the regression visible instead of papering over it with the baseline.
  const winnerMetrics = postBaseline?.metrics ?? winnerValidation?.metrics ?? priorBaseline.metrics
  const baselinePerTactic = priorBaseline.perTactic
  const winnerPerTactic = postBaseline?.perTactic ?? winnerValidation?.perTactic ?? priorBaseline.perTactic

  const finishedAt = new Date()
  const targetDir = join(OPTIMIZATIONS_ROOT, targetPath(target.id))
  const timestamp = formatTimestamp(finishedAt)
  const auditPath = join(targetDir, `${timestamp}.json`)
  const reportPath = join(targetDir, `${timestamp}.md`)

  const audit: SerializedAuditTrail = {
    version: 1,
    targetId: target.id,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    baselineHash: baselineCandidate.hash,
    winnerHash: winner.hash,
    budget: hasBudget
      ? {
          ...(args.budgetTimeSeconds !== undefined ? { time: args.budgetTimeSeconds } : {}),
          ...(args.budgetTokens !== undefined ? { tokens: args.budgetTokens } : {}),
          ...(args.budgetStagnation !== undefined ? { stagnation: args.budgetStagnation } : {}),
        }
      : null,
    stopReason,
    engineTotalIterations,
    engineProposeCalls,
    sampleSize: args.sample ?? null,
    seed: args.seed,
    operatorNotes,
    iterations: auditTrail.iterations,
    candidates: [...auditTrail.candidates.values()],
  }
  await writeAuditTrail(auditPath, audit)

  const flaggerBody = renderFlaggerReportBody({
    targetId: target.id,
    baselineFilePath: cfg.strategyFilePath,
    baselineFileText: baselineCandidate.text,
    winnerFileText: winner.text,
    perTacticBaseline: baselinePerTactic,
    perTacticWinner: winnerPerTactic,
  })
  const reportContent = renderReport({
    targetId: target.id,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    baselineHash: baselineCandidate.hash,
    winnerHash: winner.hash,
    baselineMetrics,
    winnerMetrics,
    iterations: auditTrail.iterations,
    cost: costMeter.snapshot(),
    budget: audit.budget,
    stopReason,
    sampleSize: args.sample ?? null,
    seed: args.seed,
    operatorNotesUsed: operatorNotes !== null,
    bodyMarkdown: flaggerBody,
  })
  await writeReport(reportPath, reportContent)
  await debug.close()
  await cleanupAllCandidates()

  const acceptedIterations = auditTrail.iterations.filter((it) => it.rejection === null).length
  const rejectedIterations = auditTrail.iterations.length - acceptedIterations
  printFinalBanner({
    targetId: target.id,
    improvement: !noImprovement,
    baselineHash: baselineCandidate.hash,
    winnerHash: winner.hash,
    baseline: baselineMetrics,
    winner: winnerMetrics,
    cost: costMeter.snapshot(),
    proposerCalls: proposerCallCount.value,
    proposerModelId: proposerModel.model,
    judgeModelId: target.modelId,
    iterationsAccepted: acceptedIterations,
    iterationsRejected: rejectedIterations,
    engineTotalIterations,
    engineProposeCalls,
    reflectionSize: args.reflectionSize ?? GEPA_DEFAULT_REFLECTION_SIZE,
    wallSeconds: Math.floor((finishedAt.getTime() - startedAt.getTime()) / 1000),
    stopReason,
    auditPath,
    reportPath,
    debugLogPath: args.verbose ? debugLogPath : null,
  })

  if (noImprovement) {
    console.log(`\nNo winner this run. Strategy file unchanged. Inspect the audit JSON for per-iteration details.`)
  } else if (winnerRejection !== null) {
    const deltaPp = ((winnerRejection.winnerF1 - winnerRejection.baselineF1) * 100).toFixed(1)
    console.log(
      `\nWinner rejected on validation: F1 ${(winnerRejection.winnerF1 * 100).toFixed(1)}% < saved baseline ${(winnerRejection.baselineF1 * 100).toFixed(1)}% (${deltaPp}pp).`,
    )
    console.log(`Strategy file and baseline JSON unchanged. Common causes:`)
    console.log(
      `  - Working-tree strategy file diverged from the committed baseline reference (run \`git diff ${cfg.strategyFilePath}\` to check).`,
    )
    console.log(`  - Saved baseline JSON was generated against a different model or fixture.`)
    console.log(`The winner candidate text is still in the audit JSON if you want to inspect or apply it manually.`)
  } else {
    console.log(`\nAdopted. Commit the strategy diff, the baseline JSON, and the MD report.`)
  }
}

const parseCliArgs = async (): Promise<OptimizeArgs> => {
  const { values } = parseArgs({
    options: {
      target: { type: "string" },
      "budget-time": { type: "string" },
      "budget-tokens": { type: "string" },
      "budget-stagnation": { type: "string" },
      "reflection-size": { type: "string" },
      sample: { type: "string" },
      seed: { type: "string" },
      "proposer-notes": { type: "string" },
      provider: { type: "string" },
      model: { type: "string" },
      verbose: { type: "boolean", default: false },
      "stale-ok": { type: "boolean", default: false },
      help: { type: "boolean", default: false },
    },
    allowPositionals: true,
  })

  if (values.help === true || values.target === undefined) {
    console.log(USAGE)
    process.exit(values.help === true ? 0 : 1)
  }

  const sample = values.sample !== undefined ? Number(values.sample) : undefined
  if (sample !== undefined && (!Number.isInteger(sample) || sample <= 0)) {
    throw new Error(`--sample must be a positive integer (got "${values.sample}")`)
  }

  const seed = values.seed !== undefined ? Number(values.seed) : DEFAULT_SEED
  if (!Number.isInteger(seed)) throw new Error(`--seed must be an integer (got "${values.seed}")`)

  const budgetTimeSeconds = values["budget-time"] !== undefined ? Number(values["budget-time"]) : undefined
  if (budgetTimeSeconds !== undefined && (!Number.isFinite(budgetTimeSeconds) || budgetTimeSeconds <= 0)) {
    throw new Error(`--budget-time must be positive seconds (got "${values["budget-time"]}")`)
  }
  const budgetTokens = values["budget-tokens"] !== undefined ? Number(values["budget-tokens"]) : undefined
  if (budgetTokens !== undefined && (!Number.isInteger(budgetTokens) || budgetTokens <= 0)) {
    throw new Error(`--budget-tokens must be a positive integer (got "${values["budget-tokens"]}")`)
  }
  const budgetStagnation = values["budget-stagnation"] !== undefined ? Number(values["budget-stagnation"]) : undefined
  if (budgetStagnation !== undefined && (!Number.isInteger(budgetStagnation) || budgetStagnation <= 0)) {
    throw new Error(`--budget-stagnation must be a positive integer (got "${values["budget-stagnation"]}")`)
  }
  const reflectionSize = values["reflection-size"] !== undefined ? Number(values["reflection-size"]) : undefined
  if (reflectionSize !== undefined && (!Number.isInteger(reflectionSize) || reflectionSize <= 0)) {
    throw new Error(`--reflection-size must be a positive integer (got "${values["reflection-size"]}")`)
  }

  const proposerProvider = resolveProposerProvider(values.provider)
  const proposerModel = values.model ?? DEFAULT_PROPOSER_MODELS[proposerProvider]

  return {
    targetId: values.target,
    budgetTimeSeconds,
    budgetTokens,
    budgetStagnation,
    reflectionSize,
    sample,
    seed,
    proposerNotesPath: values["proposer-notes"] ?? null,
    proposerProvider,
    proposerModel,
    verbose: values.verbose === true,
    staleOk: values["stale-ok"] === true,
  } satisfies OptimizeArgs
}

const PROVIDER_CLI_ALIASES: Record<string, ProposerProvider> = {
  bedrock: "amazon-bedrock",
  "amazon-bedrock": "amazon-bedrock",
  anthropic: "anthropic",
}

const resolveProposerProvider = (raw: string | undefined): ProposerProvider => {
  if (raw === undefined) return DEFAULT_PROPOSER_PROVIDER
  const resolved = PROVIDER_CLI_ALIASES[raw]
  if (resolved === undefined) {
    throw new Error(`--provider must be one of: ${Object.keys(PROVIDER_CLI_ALIASES).join(", ")} (got "${raw}")`)
  }
  return resolved
}

const USAGE = `usage: pnpm --filter @tools/ai-benchmarks benchmark:optimize [options]

  --target <id>             benchmark target id (required, e.g. flaggers:jailbreaking)
  --budget-time <seconds>   wall-clock budget for the optimizer (default: GEPA_MAX_TIME)
  --budget-tokens <n>       token budget for the optimizer (default: GEPA_MAX_TOKENS)
  --budget-stagnation <n>   stop after N consecutive iterations without a val-set
                            improvement (default: GEPA_MAX_STAGNATION). Increase
                            this if you want the optimizer to keep exploring even
                            after a long flat stretch — useful on long --budget-time
                            runs where the proposer needs more attempts to break out
                            of a local optimum.
  --reflection-size <n>     number of failure trajectories sampled per reflection
                            round (default: GEPA_DEFAULT_REFLECTION_SIZE).
                            Higher values give the proposer broader context per
                            iteration at the cost of more input tokens; lower
                            values run faster but see less of the failure surface.
  --sample <n>              stratified sample of N rows for cheap iteration (default: full fixture)
  --seed <n>                PRNG seed for the stratified sample AND the train/val split
                            (default: 0xbeefcafe). Same seed → same rows picked + same
                            split → results are reproducible across machines and runs.
                            Change this when you want to sanity-check that a winning
                            candidate isn't overfit to one specific split — re-run with
                            --seed 1 and confirm the F1 gain holds on a different shuffle.
  --proposer-notes <path>   path to an operator notes file appended to the proposer system prompt
                            (overrides the conventional location at
                            optimizations/<target>/proposer-notes.md)
  --provider <id>           LLM provider for the proposer call. One of: bedrock (alias for
                            amazon-bedrock), amazon-bedrock, anthropic. Default: bedrock.
                            anthropic uses LAT_ANTHROPIC_API_KEY; bedrock uses the
                            AWS credential chain (LAT_AWS_*).
  --model <id>              Proposer model id. Defaults per provider:
                            bedrock → anthropic.claude-opus-4-6-v1, anthropic → claude-opus-4-6.
  --verbose                 stream deep diagnostics (full prompts, full responses, per-row
                            evaluations, scan rejections) to a debug log file at
                            optimizations/<target>/<timestamp>-debug.log so you can
                            \`tail -f\` it in another terminal without disturbing the live UI
  --stale-ok                skip the upfront fixture-freshness check. Default behavior is to
                            abort if the local fixture's mapper hash differs from the current
                            mapper source — this catches "you forgot to re-fetch after a
                            mapper change" early instead of after a long run. Pass this when
                            you intentionally want to optimize against an out-of-date fixture.
`

const pickTarget = (id: string): BenchmarkTarget => {
  const matches = resolveTargets([id])
  if (matches.length !== 1) {
    throw new Error(
      `--target must match exactly one benchmark target (got ${matches.length}). Known: ${TARGETS.map((t) => t.id).join(", ")}`,
    )
  }
  const first = matches[0]
  if (first === undefined) {
    throw new Error(`--target ${id} matched no benchmark targets.`)
  }
  return first
}

const defaultProposerNotesPath = (targetId: string): string =>
  join(OPTIMIZATIONS_ROOT, targetPath(targetId), "proposer-notes.md")

const tryLoadOperatorNotes = async (path: string): Promise<string | null> => {
  try {
    const raw = await readFile(path, "utf8")
    return stripHtmlComments(raw).trim() || null
  } catch {
    return null
  }
}

// Strip HTML comments before injection so dev-curated scaffolding
// (header explaining the file, use-case bullets, etc.) doesn't bias the
// proposer.
const stripHtmlComments = (s: string): string => s.replace(/<!--[\s\S]*?-->/g, "")

const renderConversation = (row: FixtureRow): string => {
  const lines: string[] = []
  if (row.trace.systemPrompt !== undefined && row.trace.systemPrompt.length > 0) {
    lines.push(`[system]\n${row.trace.systemPrompt}`)
  }
  for (const m of row.trace.messages) {
    const text = m.parts
      .filter((p) => p.type === "text")
      .map((p) => p.content)
      .join("\n")
    lines.push(`[${m.role}]\n${text}`)
  }
  const joined = lines.join("\n\n")
  // OptimizationTrajectory schema requires conversationText.min(1).
  return joined.length > 0 ? joined : `(empty trace ${row.id})`
}

const evaluateRow = async (input: {
  readonly strategy: FlaggerStrategy
  readonly row: FixtureRow
  readonly target: BenchmarkTarget
}): Promise<RowEvaluation> => {
  const trace = fixtureRowToTraceDetail(input.row)

  let hasContext: boolean
  try {
    hasContext = await callStrategyMethodWithTimeout({
      method: "hasRequiredContext",
      invoke: () => input.strategy.hasRequiredContext(trace),
      timeoutMs: STRATEGY_METHOD_TIMEOUT_MS,
    })
  } catch (err) {
    return errorEvaluation(err, "deterministic-no-match", { kind: "no-required-context" })
  }
  if (!hasContext) {
    return {
      predicted: false,
      phase: "deterministic-no-match",
      costUsd: 0,
      tokensTotal: 0,
      preFilter: { kind: "no-required-context" },
      llmVerdict: null,
      errorMessage: null,
    }
  }

  // Deterministic phase is always exercised — it's part of the candidate
  // strategy file GEPA is mutating. Skipping it here would defeat the
  // purpose of letting the proposer tune the regex layer.
  const detect = input.strategy.detectDeterministically
  if (typeof detect === "function") {
    let det: ReturnType<NonNullable<FlaggerStrategy["detectDeterministically"]>>
    try {
      det = await callStrategyMethodWithTimeout({
        method: "detectDeterministically",
        invoke: () => detect.call(input.strategy, trace),
        timeoutMs: STRATEGY_METHOD_TIMEOUT_MS,
      })
    } catch (err) {
      return errorEvaluation(err, "error", { kind: "no-detect-method" })
    }
    if (det.kind === "matched") {
      return {
        predicted: true,
        phase: "deterministic-match",
        costUsd: 0,
        tokensTotal: 0,
        preFilter: { kind: "matched", feedback: det.feedback },
        llmVerdict: null,
        errorMessage: null,
      }
    }
    if (det.kind === "no-match") {
      return {
        predicted: false,
        phase: "deterministic-no-match",
        costUsd: 0,
        tokensTotal: 0,
        preFilter: { kind: "no-match" },
        llmVerdict: null,
        errorMessage: null,
      }
    }
    // ambiguous → fall through to LLM
  }

  const meter = createTokenMeter()
  const result = await Effect.runPromise(
    input.target.classify(input.row, input.strategy).pipe(
      withAi(meteringAIGenerateLive(meter)),
      Effect.match({
        onFailure: (err): { matched: boolean; error: string | null } => ({
          matched: false,
          error: err instanceof Error ? err.message : String(err),
        }),
        onSuccess: (r): { matched: boolean; error: string | null } => ({ matched: r.matched, error: null }),
      }),
    ),
  )

  const usage = meter.snapshot()
  const cost = computeCost(input.target.provider, input.target.modelId, usage)
  const tokensTotal = usage.input + usage.output + usage.reasoning
  const phase: Prediction["phase"] =
    result.error !== null
      ? "error"
      : usage.attempts === 0
        ? result.matched
          ? "deterministic-match"
          : "deterministic-no-match"
        : usage.successes < usage.attempts
          ? "schema-mismatch"
          : result.matched
            ? "llm-match"
            : "llm-no-match"

  return {
    predicted: result.matched,
    phase,
    costUsd: typeof cost.totalUsd === "number" ? cost.totalUsd : 0,
    tokensTotal,
    preFilter: { kind: "ambiguous" },
    llmVerdict: result.error !== null ? null : result.matched,
    errorMessage: result.error,
  }
}

const errorEvaluation = (err: unknown, phase: Prediction["phase"], preFilter: PreFilterSignal): RowEvaluation => ({
  predicted: false,
  phase,
  costUsd: 0,
  tokensTotal: 0,
  preFilter,
  llmVerdict: null,
  errorMessage:
    err instanceof StrategyMethodTimeoutError ? err.message : err instanceof Error ? err.message : String(err),
})

/**
 * Final summary banner. Prints AFTER ink unmounts (so the live view is
 * gone) and after the post-adoption baseline refresh (when improvement).
 *
 * ANSI color is applied unconditionally — every modern terminal handles
 * it, and CI (where colors might leak as escape codes) isn't a target
 * for this script. Hierarchy:
 *   - Bold cyan title in the divider band
 *   - Bold section headers prefixed with `▸`
 *   - Green/red/dim deltas (positive/negative/zero)
 *   - Yellow cost figures
 *   - Dim file paths
 */
const ansi = {
  reset: "\x1b[0m",
  bold: (s: string) => `\x1b[1m${s}\x1b[22m`,
  dim: (s: string) => `\x1b[2m${s}\x1b[22m`,
  green: (s: string) => `\x1b[32m${s}\x1b[39m`,
  red: (s: string) => `\x1b[31m${s}\x1b[39m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[39m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[39m`,
  magenta: (s: string) => `\x1b[35m${s}\x1b[39m`,
}

const STOP_REASON_LABEL: Record<OptimizationStopReason, string> = {
  time: "time budget reached",
  tokens: "tokens budget reached",
  stagnation: "stagnation (no improvement)",
  completed: "optimizer exhausted candidate pool",
}

const formatStopReason = (reason: OptimizationStopReason | null): string =>
  reason === null ? ansi.dim("unknown") : STOP_REASON_LABEL[reason]

const printFinalBanner = (input: {
  readonly targetId: string
  readonly improvement: boolean
  readonly baselineHash: string
  readonly winnerHash: string
  readonly baseline: Metrics
  readonly winner: Metrics
  readonly cost: ReturnType<typeof createCostMeter> extends { snapshot(): infer T } ? T : never
  readonly proposerCalls: number
  readonly proposerModelId: string
  readonly judgeModelId: string
  readonly iterationsAccepted: number
  readonly iterationsRejected: number
  /**
   * Total main-loop iterations the underlying optimizer engine actually
   * entered (e.g. GEPA's `state.i`). Includes silently-skipped iterations
   * that never reached a propose call. Null if the engine didn't report it.
   */
  readonly engineTotalIterations: number | null
  /**
   * Number of accepted candidates added to the engine's pool (i.e.
   * iterations that survived subsample-acceptance and grew the candidate
   * set). Compare with `engineTotalIterations` to spot silent skips.
   */
  readonly engineProposeCalls: number | null
  /**
   * Reflection minibatch size used by GEPA (resolved default if the user
   * didn't pass `--reflection-size`). Used to estimate silent-skip cost
   * in the banner: silentSkips × reflectionSize × avgEvalCost.
   */
  readonly reflectionSize: number
  readonly wallSeconds: number
  readonly stopReason: OptimizationStopReason | null
  readonly auditPath: string
  readonly reportPath: string
  readonly debugLogPath: string | null
}): void => {
  const { baseline, winner } = input
  const fmtDelta = (a: number, b: number): string => {
    if (!Number.isFinite(a) || !Number.isFinite(b)) return ansi.dim("n/a")
    const d = (b - a) * 100
    const sign = d >= 0 ? "+" : ""
    const text = `${sign}${d.toFixed(1)}pp`
    if (Math.abs(d) < 0.05) return ansi.dim(text)
    return d >= 0 ? ansi.green(text) : ansi.red(text)
  }
  const fmtElapsed = (s: number): string => {
    const h = Math.floor(s / 3600)
    const m = Math.floor((s % 3600) / 60)
    const sec = s % 60
    return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`
  }
  const divider = ansi.cyan("═".repeat(78))
  const subdivider = ansi.dim("─".repeat(48))
  const section = (title: string) => `\n ${ansi.bold(ansi.cyan("▸"))} ${ansi.bold(title)}`

  console.log(`\n${divider}`)
  console.log(` ${ansi.bold(ansi.cyan(input.targetId))} ${ansi.dim("— optimization complete")}`)
  console.log(divider)

  console.log(section("Outcome"))
  if (input.improvement) {
    console.log(
      `   ${ansi.green("✓ winner found")}  ${ansi.magenta(input.winnerHash.slice(0, 8))} ${ansi.dim("vs baseline")} ${ansi.dim(input.baselineHash.slice(0, 8))}`,
    )
  } else {
    console.log(
      `   ${ansi.red("✗ no improvement")}  ${ansi.dim(`winner === baseline ${input.baselineHash.slice(0, 8)}`)}`,
    )
  }
  console.log(`   ${ansi.dim("Wall time   ")}${fmtElapsed(input.wallSeconds)}`)
  console.log(
    `   ${ansi.dim("Iterations  ")}${input.iterationsAccepted + input.iterationsRejected} attempted · ${ansi.green(`${input.iterationsAccepted} accepted`)} · ${ansi.red(`${input.iterationsRejected} rejected`)}`,
  )
  console.log(`   ${ansi.dim("Proposer    ")}${input.proposerCalls} calls`)
  if (input.engineTotalIterations !== null) {
    // Engine = GEPA's main-loop iteration count. Diff vs. propose calls
    // surfaces "silent skips" — iterations the engine entered but skipped
    // before ever calling our propose adapter (gepa's skip_perfect_score
    // path on small minibatches, merge-only iterations). When this number
    // dwarfs the propose count and the run stopped on stagnation, the
    // baseline is too strong for the current `--reflection-size`; bump it
    // to make subsamples less likely to all be perfect.
    const engineAccepted = input.engineProposeCalls ?? 0
    const skipped = Math.max(0, input.engineTotalIterations - engineAccepted)
    console.log(
      `   ${ansi.dim("Engine      ")}${input.engineTotalIterations} loop iters · ${ansi.green(`${engineAccepted} reached propose`)} · ${ansi.yellow(`${skipped} silently skipped`)}`,
    )
  }
  console.log(`   ${ansi.dim("Stop reason ")}${formatStopReason(input.stopReason)}`)

  console.log(section("Metrics"))
  console.log(`   ${ansi.dim("                  Baseline    Winner    Δ")}`)
  console.log(`   ${subdivider}`)
  const row = (label: string, a: number, b: number) =>
    `   ${label.padEnd(14)}  ${formatPercent(a).padStart(8)}  ${formatPercent(b).padStart(8)}    ${fmtDelta(a, b)}`
  console.log(row("Precision", baseline.precision, winner.precision))
  console.log(row("Recall", baseline.recall, winner.recall))
  console.log(row("F1", baseline.f1, winner.f1))
  console.log(row("Accuracy", baseline.accuracy, winner.accuracy))

  console.log(section("Cost"))
  console.log(
    `   ${ansi.dim(`Proposer (${input.proposerModelId})`.padEnd(22))}${ansi.yellow(formatCostUsd(input.cost.proposerUsd).padStart(10))}`,
  )
  console.log(
    `   ${ansi.dim(`Judge (${input.judgeModelId})`.padEnd(22))}${ansi.yellow(formatCostUsd(input.cost.judgeUsd).padStart(10))}`,
  )
  // Coarse silent-skip estimate: a skipped iteration runs `reflectionSize`
  // judge evals before bailing in `skip_perfect_score`. We multiply that
  // by the average judge-eval cost (judgeUsd / judgeEvalCount). The
  // estimate is approximate — merge-only iterations in the silent-skip
  // bucket can run more (subsample + maybe full val) — but it's enough to
  // see at a glance whether silent skips are a meaningful share of cost.
  // Skipped when there's no engine report or no judge evals to average.
  if (
    input.engineTotalIterations !== null &&
    input.engineProposeCalls !== null &&
    input.cost.judgeEvalCount > 0 &&
    input.cost.judgeUsd > 0
  ) {
    const skipped = Math.max(0, input.engineTotalIterations - input.engineProposeCalls)
    if (skipped > 0) {
      const avgEvalCost = input.cost.judgeUsd / input.cost.judgeEvalCount
      const burn = skipped * input.reflectionSize * avgEvalCost
      console.log(
        `   ${ansi.dim("  └ silent skips (est)".padEnd(22))}${ansi.yellow(formatCostUsd(burn).padStart(10))} ${ansi.dim(`(${skipped} × ${input.reflectionSize} evals)`)}`,
      )
    }
  }
  console.log(`   ${subdivider}`)
  console.log(
    `   ${ansi.bold("Total")}${ansi.dim("                ")}${ansi.bold(ansi.yellow(formatCostUsd(input.cost.totalUsd).padStart(10)))}`,
  )

  console.log(section("Artifacts"))
  console.log(`   ${ansi.dim("Audit JSON   ")}${ansi.dim(input.auditPath)}`)
  console.log(`   ${ansi.dim("MD Report    ")}${ansi.dim(input.reportPath)}`)
  if (input.debugLogPath !== null) {
    console.log(`   ${ansi.dim("Debug log    ")}${ansi.dim(input.debugLogPath)}`)
  }

  console.log(`\n${divider}`)
}

// Bridges the in-process runBenchmark phase stream into the optimizer's
// ink Activity. Only structural phases drive UI; the terminal `done`
// payload is consumed by the caller (which already has postBaseline read
// off disk by that point).
const mapBenchmarkPhase = (phase: BenchmarkRunPhase): BenchmarkingPhase | null => {
  switch (phase.kind) {
    case "fetching-fixture":
    case "checking-freshness":
    case "loading-fixture":
    case "computing-metrics":
    case "writing-baseline":
      return { kind: phase.kind }
    case "classifying":
      return { kind: "classifying", rowsDone: phase.rowsDone, rowsTotal: phase.rowsTotal }
    case "fixture-fetched":
    case "fixture-loaded":
    case "done":
      return null
  }
}

// Bootstrap path: ink isn't mounted yet, so phase events go to stdout as
// terse one-liners. Using overwrite-on-the-same-line here would compete
// with subsequent log lines (the eventual ink mount), so plain newlines
// are fine — the user sees a short scrollable history of the bootstrap
// run, then the optimizer starts.
const logBenchmarkPhase =
  (targetId: string) =>
  (phase: BenchmarkRunPhase): void => {
    switch (phase.kind) {
      case "fetching-fixture":
        console.log(`[${targetId}] no local fixture yet — fetching dataset (this only runs once)…`)
        return
      case "fixture-fetched":
        console.log(`[${targetId}] fetched ${phase.rowsTotal} rows`)
        return
      case "checking-freshness":
        console.log(`[${targetId}] checking fixture freshness…`)
        return
      case "loading-fixture":
        console.log(`[${targetId}] loading fixture…`)
        return
      case "fixture-loaded":
        console.log(
          `[${targetId}] loaded ${phase.rowsTotal} rows${phase.sampledFrom !== null ? ` (sample of ${phase.sampledFrom})` : ""}`,
        )
        return
      case "classifying":
        // Only log every 50 rows + final to keep bootstrap output tight.
        if (phase.rowsDone === phase.rowsTotal || phase.rowsDone % 50 === 0) {
          console.log(`[${targetId}] classified ${phase.rowsDone}/${phase.rowsTotal}`)
        }
        return
      case "computing-metrics":
        console.log(`[${targetId}] computing metrics…`)
        return
      case "writing-baseline":
        console.log(`[${targetId}] writing baseline…`)
        return
      case "done":
        console.log(
          `[${targetId}] baseline established · f1=${formatPercent(phase.report.metrics.f1)} · ${formatCostUsd(phase.report.cost.totalUsd)}`,
        )
        return
    }
  }

const chooseProposeContext = (context: readonly OptimizationTrajectory[]): readonly OptimizationTrajectory[] => {
  // Send only failure-shaped trajectories to the proposer when any exist.
  // "Failure-shaped" includes:
  //   - `!passed` (the candidate predicted incorrectly)
  //   - `phase: "candidate-rejected"` (the candidate failed to compile/load)
  //   - `errorMessage` set (a strategy method or classify call threw)
  // The last two override `passed`: a candidate that crashes can still
  // accidentally `pass` a negative row (predicted=false matches expected=false),
  // but the runtime/load failure is the signal we want the proposer to see —
  // not the meaningless per-row prediction.
  const failures = context.filter((t) => !t.passed || hasFailureSignal(t))
  return failures.length > 0 ? failures : context
}

const hasFailureSignal = (t: OptimizationTrajectory): boolean => {
  if (t.feedback === "") return false
  try {
    const parsed = JSON.parse(t.feedback) as { phase?: unknown; errorMessage?: unknown }
    return parsed.phase === "candidate-rejected" || typeof parsed.errorMessage === "string"
  } catch {
    return false
  }
}

const diffTopLevelDeclarations = (a: string, b: string): readonly string[] => {
  // Cheap heuristic: compare lines of the form `export const X` and
  // `function Y(`. Good enough for the iteration table; the MD report
  // shows the literal unified diff.
  const decls = (text: string): Set<string> => {
    const names = new Set<string>()
    for (const m of text.matchAll(/^export\s+(?:const|function|class|interface|type)\s+([A-Za-z0-9_]+)/gm)) {
      const name = m[1]
      if (name !== undefined) names.add(name)
    }
    for (const m of text.matchAll(/^(?:const|function|class)\s+([A-Z_][A-Z0-9_]*)/gm)) {
      const name = m[1]
      if (name !== undefined) names.add(name)
    }
    return names
  }
  const before = decls(a)
  const after = decls(b)
  const changed = new Set<string>()
  for (const n of after) {
    if (!before.has(n) || excerpt(a, n) !== excerpt(b, n)) changed.add(n)
  }
  for (const n of before) {
    if (!after.has(n)) changed.add(`-${n}`)
  }
  return [...changed].sort()
}

const excerpt = (text: string, name: string): string => {
  const re = new RegExp(`(?:export\\s+)?(?:const|function|class|interface|type)\\s+${name}\\b[\\s\\S]{0,400}`)
  const m = text.match(re)
  return m?.[0] ?? ""
}

const formatTimestamp = (date: Date): string => {
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`
}

const toHex = (n: number): string => `0x${n.toString(16)}`

// Single-char encoding for an eval row's phase, used by the per-row dot
// stream in debug.log. See the comment block on the dot stream above
// `tickEvaluateStart` for the full char map.
const charForEvalPhase = (phase: string): string => {
  if (phase === "error" || phase === "schema-mismatch") return "!"
  if (phase === "llm-match" || phase === "llm-no-match") return "o"
  return "."
}

// Compact one-line render of a single proposer edit for the debug log.
// Shape: `'<find anchor preview>'  -Xc/Yl → +Zc/Wl`
//   - find anchor: first non-empty line of `find`, trimmed and capped.
//     Tells the reader WHERE the edit happens at a glance during tail -f.
//   - chars/lines on each side: lets the reader see the size shape of
//     the change without scrolling through the literal find/replace text.
// Deletion (replace == "") is rendered as `→ (delete)` for readability.
const formatEditSummary = (edit: { readonly find: string; readonly replace: string }): string => {
  const anchor = anchorPreview(edit.find)
  const findChars = edit.find.length
  const findLines = countLines(edit.find)
  const replaceChars = edit.replace.length
  const replaceLines = countLines(edit.replace)
  const right = edit.replace === "" ? "(delete)" : `+${replaceChars}c/${replaceLines}l`
  return `'${anchor}'  -${findChars}c/${findLines}l → ${right}`
}

const anchorPreview = (s: string): string => {
  const firstNonEmpty = s.split("\n").find((line) => line.trim().length > 0) ?? s
  const trimmed = firstNonEmpty.trim()
  return trimmed.length > 80 ? `${trimmed.slice(0, 80)}…` : trimmed
}

const countLines = (s: string): number => {
  if (s === "") return 0
  // A trailing newline doesn't add a "line" to the human eye — count the
  // text lines, not the line terminators.
  const ends = s.endsWith("\n") ? s.slice(0, -1) : s
  return ends.split("\n").length
}

/**
 * Verbose debug log writer. Streams to a plain-text file that the dev can
 * `tail -f` in another terminal without interfering with the live ink view.
 *
 * No-op when disabled (returns the same shape but every method is a noop)
 * — keeps the call sites in `main()` clean (no `if (args.verbose)` checks
 * peppered through the orchestrator). Cost when disabled is ~zero (a few
 * empty function calls per evaluate row).
 *
 * Append-only writes via a single fs.WriteStream; flushed on `close()`
 * before process exit.
 */
type DebugLog = {
  section(title: string): void
  kv(key: string, value: string): void
  text(line: string): void
  code(content: string, opts: { readonly lang: string; readonly truncate?: number }): void
  tick(message: string): void
  /**
   * Stream a literal string with no timestamp, no prefix, no trailing
   * newline. For per-row eval progress: one character per row appended
   * to the same line, terminated naturally by the next `section`/`tick`
   * call (which write their own leading content). Cheap to no-op when
   * the log is disabled.
   */
  dot(s: string): void
  close(): Promise<void>
}

const createDebugLog = async (input: { readonly enabled: boolean; readonly path: string }): Promise<DebugLog> => {
  if (!input.enabled) {
    const noop = (): void => {}
    return {
      section: noop,
      kv: noop,
      text: noop,
      code: noop,
      tick: noop,
      dot: noop,
      close: async () => {},
    }
  }

  const { mkdir } = await import("node:fs/promises")
  const { createWriteStream } = await import("node:fs")
  await mkdir(dirname(input.path), { recursive: true })
  const stream = createWriteStream(input.path, { flags: "a", encoding: "utf8" })

  const ts = (): string => `[${new Date().toISOString().slice(11, 23)}]`

  const write = (s: string): void => {
    stream.write(s)
  }

  return {
    section(title) {
      write(`\n${"=".repeat(72)}\n${ts()} === ${title} ===\n`)
    },
    kv(key, value) {
      write(`${ts()} ${key}: ${value}\n`)
    },
    text(line) {
      write(`${line}\n`)
    },
    code(content, opts) {
      const truncated =
        opts.truncate !== undefined && content.length > opts.truncate
          ? `${content.slice(0, opts.truncate)}\n... [truncated ${content.length - opts.truncate} chars] ...\n`
          : content
      write(`\`\`\`${opts.lang}\n${truncated}${truncated.endsWith("\n") ? "" : "\n"}\`\`\`\n`)
    },
    tick(message) {
      write(`${ts()} · ${message}\n`)
    },
    dot(s) {
      write(s)
    },
    close: () =>
      new Promise<void>((resolve) => {
        stream.end(() => resolve())
      }),
  }
}

await main()
