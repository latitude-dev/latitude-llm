import { spawn } from "node:child_process"
import { readFile, stat, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { createInterface } from "node:readline/promises"
import { fileURLToPath } from "node:url"
import { parseArgs } from "node:util"
import type { QueueStrategy } from "@domain/annotation-queues"
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
import { GepaOptimizerLive } from "@platform/op-gepa"
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
  FLAGGER_PROPOSER_MODEL,
  type FlaggerProposerResult,
} from "../optimize/flagger/proposer.ts"
import { renderFlaggerReportBody } from "../optimize/flagger/report.ts"
import { renderReport, writeReport } from "../optimize/report-renderer.ts"
import { loadPackageContext, sniffRegexDosRisk } from "../optimize/safety-scan.ts"
import { type Activity, OptimizeView, type OptimizeViewState, type RecentEvent } from "../optimize/ui/OptimizeView.tsx"
import { fixtureRowToTraceDetail } from "../runner/adapter.ts"
import { createTokenMeter } from "../runner/meter.ts"
import { meteringAIGenerateLive } from "../runner/metering-ai.ts"
import { computeMetrics, computeMetricsBy, type Metrics, type Prediction } from "../runner/metrics.ts"
import { computeCost } from "../runner/pricing.ts"
import { stratifiedSample } from "../runner/sample.ts"
import { type BenchmarkTarget, resolveTargets, TARGETS, targetPath } from "../runner/targets.ts"
import { type FixtureRow, fixtureRowSchema } from "../types.ts"
import { formatCostUsd, formatPercent } from "../ui/format.ts"

const PKG_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..")
const FIXTURES_ROOT = join(PKG_ROOT, "fixtures")
const OPTIMIZATIONS_ROOT = join(PKG_ROOT, "optimizations")

const DEFAULT_SEED = 0xbeefcafe
const TRAIN_RATIO = 0.8
const VALIDATION_RATIO = 0.2
const STRATEGY_METHOD_TIMEOUT_MS = 5000
const MAX_TRAJECTORIES_PER_PROPOSE = 30

interface OptimizeArgs {
  readonly targetId: string
  readonly budgetTimeSeconds: number | undefined
  readonly budgetTokens: number | undefined
  readonly budgetStagnation: number | undefined
  readonly sample: number | undefined
  readonly seed: number
  readonly proposerNotesPath: string | null
  readonly verbose: boolean
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

  const cfg = target.optimization
  const rows = await loadFixture(target)
  const sampledRows = args.sample !== undefined ? stratifiedSample(rows, args.sample, args.seed) : rows
  const rowsById = new Map(sampledRows.map((r) => [r.id, r]))

  const baselineFileText = await readFile(cfg.strategyFilePath, "utf8")
  const baselineHash = await hashOptimizationCandidateText(baselineFileText)
  const baselineCandidate: OptimizationCandidate = {
    componentId: `flagger-strategy:${cfg.queueSlug}`,
    text: baselineFileText,
    hash: baselineHash,
  }

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

  console.log(`\n=== ${target.id} ===`)
  console.log(
    `starting optimization · rows=${sampledRows.length} (train=${dataset.trainset.length} val=${dataset.valset.length}) · seed=${toHex(args.seed)}`,
  )
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
      warnings: [],
      recentEvents: [],
      proposerModel: FLAGGER_PROPOSER_MODEL.model,
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
  const addWarning = (msg: string): void => {
    viewState.current = { ...viewState.current, warnings: [...viewState.current.warnings, msg] }
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
  const tickEvaluateStart = (hash: string): void => {
    if (hash !== evalCurrentHash) {
      evalCurrentHash = hash
      evalRowsForCurrent = 0
      evalPhaseCounts = {}
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
  }

  const ink = render(createElement(OptimizeView, { getState: () => viewState.current }))

  const evaluate = async (input: {
    readonly candidate: OptimizationCandidate
    readonly example: { readonly id: string }
  }): Promise<OptimizationEvaluationResult> => {
    const row = rowsById.get(input.example.id)
    if (row === undefined) throw new Error(`evaluate: unknown row ${input.example.id}`)

    let strategy: QueueStrategy
    try {
      const loaded = await loadFlaggerCandidate({
        hash: input.candidate.hash,
        text: input.candidate.text,
        exportName: cfg.exportName,
        context: packageContext,
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
      return { trajectory }
    }

    tickEvaluateStart(input.candidate.hash)
    const evalStartedMs = Date.now()
    const evaluation = await evaluateRow({
      strategy,
      row,
      target,
    })
    if (evaluation.costUsd > 0) costMeter.addJudgeUsd(evaluation.costUsd)
    recordEvaluateDone(evaluation.phase)

    const evalElapsedMs = Date.now() - evalStartedMs
    debug.tick(
      `evaluate ${input.candidate.hash.slice(0, 8)} row=${row.id} expected=${row.expected.matched} predicted=${evaluation.predicted} phase=${evaluation.phase} preFilter=${evaluation.preFilter.kind} ${evalElapsedMs}ms${evaluation.costUsd > 0 ? ` cost=${formatCostUsd(evaluation.costUsd)}` : ""}${evaluation.errorMessage ? ` err=${evaluation.errorMessage.slice(0, 80)}` : ""}`,
    )

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
        queueSlug: cfg.queueSlug,
        exportName: cfg.exportName,
        maxTrajectories: MAX_TRAJECTORIES_PER_PROPOSE,
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

    // AI-call failure path. Returning an empty-hash candidate would crash
    // GEPA's Python side (Zod min(1) on script hash). Return parent so
    // GEPA sees a no-op iteration. The Vercel SDK already retries
    // network/throttling errors internally; persistent failures (Bedrock
    // auth, model access) won't be fixed by retrying with different
    // prompt text either. Either way: surface, audit, move on.
    if (proposeResult.candidate.hash === "" || proposeResult.candidate.text === "") {
      const truncated = proposeResult.reasoning.replace(/\s+/g, " ").slice(0, 100)
      pushEvent(`AI error (${elapsed}s): ${truncated}`, "err")
      debug.text("--- proposer error (full) ---")
      debug.text(proposeResult.reasoning)
      recordIteration(auditTrail, {
        iteration: auditTrail.iterations.length + 1,
        parentHash: input.candidate.hash,
        childHash: input.candidate.hash,
        proposerReasoning: proposeResult.reasoning,
        proposerCostUsd: proposeResult.costUsd,
        proposerAttempts: 1,
        changedDeclarations: [],
        rejection: { stage: "proposer-error", reason: proposeResult.reasoning },
        timestampMs: Date.now(),
      })
      refreshIterations()
      return input.candidate
    }

    debug.text("--- proposer reasoning ---")
    debug.text(proposeResult.reasoning)
    debug.kv(
      "proposer fileText",
      `${proposeResult.candidate.text.length} chars · hash ${proposeResult.candidate.hash.slice(0, 8)} (see audit JSON / review TUI)`,
    )

    // Pass the candidate through unconditionally — no propose-time scan,
    // no rejection short-circuit. The candidate-loader does the scan at
    // evaluate time; if it fails there, the evaluate callback emits
    // per-row trajectories with `phase: "candidate-rejected"` and the
    // rejection reason in feedback. The next propose call sees those
    // trajectories and adapts.
    recordCandidate(auditTrail, proposeResult.candidate)
    const dosWarnings = sniffRegexDosRisk(proposeResult.candidate.text)
    for (const w of dosWarnings) addWarning(w)
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

  // Final measurement: run the winner over the full sample so the user sees
  // pre-adoption row changes. Reuses the same `evaluateRow` path used during
  // optimization; metrics include the deterministic phase.
  const baselineMeasurement = await measureFullPass({
    label: "baseline",
    targetId: target.id,
    rows: sampledRows,
    target,
    candidate: baselineCandidate,
    cfg,
    packageContext,
    costMeter,
    onProgress: (rowsDone, rowsTotal) => {
      setActivity({ kind: "measuring", label: "baseline", rowsDone, rowsTotal })
    },
  })
  const winnerMeasurement = await measureFullPass({
    label: "winner",
    targetId: target.id,
    rows: sampledRows,
    target,
    candidate: winner,
    cfg,
    packageContext,
    costMeter,
    onProgress: (rowsDone, rowsTotal) => {
      setActivity({ kind: "measuring", label: "winner", rowsDone, rowsTotal })
    },
  })

  setActivity({
    kind: "done",
    message: `optimization complete · ${proposerCallCount.value} propose calls · cost ${formatCostUsd(costMeter.totalUsd())}`,
  })
  refreshIterations()
  ink.unmount()
  await ink.waitUntilExit()

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
    perTacticBaseline: baselineMeasurement.perTactic,
    perTacticWinner: winnerMeasurement.perTactic,
  })
  const reportContent = renderReport({
    targetId: target.id,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    baselineHash: baselineCandidate.hash,
    winnerHash: winner.hash,
    baselineMetrics: baselineMeasurement.metrics,
    winnerMetrics: winnerMeasurement.metrics,
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

  const noImprovement = winner.hash === baselineCandidate.hash
  const acceptedIterations = auditTrail.iterations.filter((it) => it.rejection === null).length
  const rejectedIterations = auditTrail.iterations.length - acceptedIterations
  printFinalBanner({
    targetId: target.id,
    improvement: !noImprovement,
    baselineHash: baselineCandidate.hash,
    winnerHash: winner.hash,
    baseline: baselineMeasurement.metrics,
    winner: winnerMeasurement.metrics,
    cost: costMeter.snapshot(),
    proposerCalls: proposerCallCount.value,
    iterationsAccepted: acceptedIterations,
    iterationsRejected: rejectedIterations,
    wallSeconds: Math.floor((finishedAt.getTime() - startedAt.getTime()) / 1000),
    stopReason,
    auditPath,
    reportPath,
    debugLogPath: args.verbose ? debugLogPath : null,
  })

  if (noImprovement) {
    // Nothing to adopt — skip the prompt entirely. The user already has
    // every artifact (audit JSON + MD report) needed to investigate why.
    console.log(`\nNo winner this run. Inspect the audit JSON for per-iteration details.`)
    return
  }

  // Adopt prompt — only fires when there's an actual diff to write.
  // On 'y', overwrite the strategy file and trigger benchmark:run
  // --update-baseline so the committed baseline reflects the new prompt
  // right away.
  const adopt = await promptAdopt(target.id)
  if (adopt) {
    await writeFile(cfg.strategyFilePath, winner.text)
    console.log(`strategy file updated: ${cfg.strategyFilePath}`)
    console.log(`running benchmark:run --update-baseline …`)
    await runUpdateBaseline(target.id)
    console.log(`adoption complete. Commit the strategy diff, the baseline JSON, and the MD report.`)
  } else {
    console.log(`not adopted. The winning text is preserved in the audit JSON for manual copy-paste.`)
  }
}

const parseCliArgs = async (): Promise<OptimizeArgs> => {
  const { values } = parseArgs({
    options: {
      target: { type: "string" },
      "budget-time": { type: "string" },
      "budget-tokens": { type: "string" },
      "budget-stagnation": { type: "string" },
      sample: { type: "string" },
      seed: { type: "string" },
      "proposer-notes": { type: "string" },
      verbose: { type: "boolean", default: false },
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

  return {
    targetId: values.target,
    budgetTimeSeconds,
    budgetTokens,
    budgetStagnation,
    sample,
    seed,
    proposerNotesPath: values["proposer-notes"] ?? null,
    verbose: values.verbose === true,
  } satisfies OptimizeArgs
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
  --verbose                 stream deep diagnostics (full prompts, full responses, per-row
                            evaluations, scan rejections) to a debug log file at
                            optimizations/<target>/<timestamp>-debug.log so you can
                            \`tail -f\` it in another terminal without disturbing the live UI
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

const loadFixture = async (target: BenchmarkTarget): Promise<readonly FixtureRow[]> => {
  const path = join(FIXTURES_ROOT, `${targetPath(target.id)}.jsonl`)
  try {
    await stat(path)
  } catch {
    throw new Error(
      `fixture missing for ${target.id}: ${path}\nrun: pnpm --filter @tools/ai-benchmarks benchmark:fetch ${target.id}`,
    )
  }
  const raw = await readFile(path, "utf8")
  const lines = raw.split("\n").filter((l) => l.trim().length > 0)
  return lines.map((line, i) => {
    const parsed = fixtureRowSchema.safeParse(JSON.parse(line))
    if (!parsed.success) {
      throw new Error(`fixture ${target.id} line ${i + 1} failed schema: ${parsed.error.message}`)
    }
    return parsed.data
  })
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
  readonly strategy: QueueStrategy
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
    let det: ReturnType<NonNullable<QueueStrategy["detectDeterministically"]>>
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

interface FullPassResult {
  readonly metrics: Metrics
  readonly perTactic: Record<string, Metrics>
  readonly predictions: readonly Prediction[]
  readonly costUsd: number
}

const measureFullPass = async (input: {
  readonly label: string
  readonly targetId: string
  readonly rows: readonly FixtureRow[]
  readonly target: BenchmarkTarget
  readonly candidate: OptimizationCandidate
  readonly cfg: NonNullable<BenchmarkTarget["optimization"]>
  readonly packageContext: Awaited<ReturnType<typeof loadPackageContext>>
  readonly costMeter: ReturnType<typeof createCostMeter>
  readonly onProgress?: (rowsDone: number, rowsTotal: number) => void
}): Promise<FullPassResult> => {
  const loaded = await loadFlaggerCandidate({
    hash: input.candidate.hash,
    text: input.candidate.text,
    exportName: input.cfg.exportName,
    context: input.packageContext,
  })

  const predictions: Prediction[] = []
  let runningCost = 0
  let done = 0
  for (const row of input.rows) {
    const ev = await evaluateRow({
      strategy: loaded.shape,
      row,
      target: input.target,
    })
    if (ev.costUsd > 0) {
      runningCost += ev.costUsd
      input.costMeter.addJudgeUsd(ev.costUsd)
    }
    predictions.push({
      id: row.id,
      expected: row.expected.matched,
      predicted: ev.predicted,
      phase: ev.phase,
      tags: row.tags,
      ...(ev.errorMessage !== null ? { errorMessage: ev.errorMessage } : {}),
    })
    done++
    input.onProgress?.(done, input.rows.length)
  }

  const metrics = computeMetrics(predictions)
  const perTactic = computeMetricsBy(predictions, (p) => {
    const tactic = p.tags.find((t) =>
      ["persona-aim", "fictional-framing", "adversarial-suffix", "jbb-benign", "jbb-harmful-direct"].includes(t),
    )
    return (tactic ?? "other") as string
  })
  return { metrics, perTactic, predictions, costUsd: runningCost }
}

/**
 * Final summary banner. Prints AFTER ink unmounts (so the live view is
 * gone) and before the adopt prompt fires (only on improvement).
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
  time_budget: "time budget reached",
  tokens_budget: "tokens budget reached",
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
  readonly iterationsAccepted: number
  readonly iterationsRejected: number
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
    `   ${ansi.dim("Proposer (Opus 4.7)  ")}${ansi.yellow(formatCostUsd(input.cost.proposerUsd).padStart(10))}`,
  )
  console.log(`   ${ansi.dim("Judge (Nova Lite)    ")}${ansi.yellow(formatCostUsd(input.cost.judgeUsd).padStart(10))}`)
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

const promptAdopt = async (_targetId: string): Promise<boolean> => {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  try {
    const answer = await rl.question(`\nAdopt this winner? [y/N] `)
    return answer.trim().toLowerCase() === "y"
  } finally {
    rl.close()
  }
}

const runUpdateBaseline = (targetId: string): Promise<void> =>
  new Promise((resolve, reject) => {
    const child = spawn(
      "pnpm",
      ["--filter", "@tools/ai-benchmarks", "benchmark:run", "--only", targetId, "--update-baseline"],
      {
        cwd: PKG_ROOT,
        stdio: "inherit",
      },
    )
    child.once("error", reject)
    child.once("exit", (code) => {
      if (code === 0) resolve()
      else reject(new Error(`benchmark:run --update-baseline exited ${code}`))
    })
  })

const chooseProposeContext = (context: readonly OptimizationTrajectory[]): readonly OptimizationTrajectory[] => {
  // Send only failure-shaped trajectories to the proposer when any exist.
  // "Failure-shaped" includes:
  //   - `!passed` (the candidate predicted incorrectly)
  //   - `phase: "candidate-rejected"` regardless of `passed` (the candidate
  //     failed to compile/load — the rejection signal is what we want the
  //     proposer to see, not the accidental "correctness" on negative rows)
  const failures = context.filter((t) => !t.passed || isCandidateRejected(t))
  return failures.length > 0 ? failures : context
}

const isCandidateRejected = (t: OptimizationTrajectory): boolean => {
  if (t.feedback === "") return false
  try {
    const parsed = JSON.parse(t.feedback) as { phase?: unknown }
    return parsed.phase === "candidate-rejected"
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
    close: () =>
      new Promise<void>((resolve) => {
        stream.end(() => resolve())
      }),
  }
}

await main()
