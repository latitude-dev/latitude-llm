import { createHash, randomUUID } from "node:crypto"
import {
  type AnnotationQueue,
  AnnotationQueueRepository,
  LIVE_QUEUE_DEFAULT_SAMPLING,
  provisionSystemQueuesUseCase,
} from "@domain/annotation-queues"
import { type Evaluation, EvaluationRepository } from "@domain/evaluations"
import { deterministicSampling } from "@domain/shared"
import {
  AGENT_PROFILES,
  type AgentProfile,
  SEED_ACCESS_EVALUATION_ID,
  SEED_API_KEY_TOKEN,
  SEED_COMBINATION_EVALUATION_ID,
  SEED_EVALUATION_ID,
  SEED_ORG_ID,
  SEED_PROJECT_ID,
  SEED_PROJECT_SLUG,
  SEED_RETURNS_EVALUATION_ID,
} from "@domain/shared/seeding"
import { TRACE_END_DEBOUNCE_MS } from "@domain/spans"
import {
  AnnotationQueueRepositoryLive,
  closePostgres,
  createPostgresClient,
  EvaluationRepositoryLive,
  withPostgres,
} from "@platform/db-postgres"
import { Effect, Layer } from "effect"
import { liveSeedFixtureKeys, liveSeedFixtures } from "./fixtures.ts"
import { type BuiltTraceSpan, buildTraceRequests } from "./otlp.ts"
import { createSeededRng } from "./random.ts"
import type { LiveSeedFixtureDefinition, LiveSeedGeneratedTrace } from "./types.ts"

const HIGH_COST_LIVE_QUEUE_SLUG = "high-cost-traces"
const FRUSTRATION_SYSTEM_QUEUE_SLUG = "frustration"
const MAX_TRACE_ID_SEARCH_ATTEMPTS = 50_000

const SEEDED_EVALUATION_ORDER = [
  SEED_EVALUATION_ID,
  SEED_COMBINATION_EVALUATION_ID,
  SEED_RETURNS_EVALUATION_ID,
  SEED_ACCESS_EVALUATION_ID,
] as const
const SEEDED_EVALUATION_ID_SET = new Set<string>(SEEDED_EVALUATION_ORDER)

const EVALUATION_LABELS: Record<string, string> = {
  [SEED_EVALUATION_ID]: "warranty",
  [SEED_COMBINATION_EVALUATION_ID]: "combination",
  [SEED_RETURNS_EVALUATION_ID]: "returns",
  [SEED_ACCESS_EVALUATION_ID]: "access",
}

export type SeedTargets = {
  readonly evaluationsById: Readonly<Record<string, Evaluation>>
  readonly highCostLiveQueue: AnnotationQueue
  readonly systemQueuesBySlug: Readonly<Record<string, AnnotationQueue>>
}

export type LiveSeedSamplePreview = {
  readonly evaluations: Readonly<Record<string, boolean>>
  readonly liveQueue?: boolean
  readonly systemQueues?: Readonly<Record<string, boolean>>
}

export type ResolvedLiveSeedTrace = {
  readonly fixture: LiveSeedFixtureDefinition
  readonly instanceIndex: number
  readonly generatedTrace: LiveSeedGeneratedTrace
  readonly traceId: string
  readonly samples: LiveSeedSamplePreview
}

export type LiveSeedRunPlan = {
  readonly seed: string
  readonly runId: string
  readonly traces: readonly ResolvedLiveSeedTrace[]
}

export type SendLiveSeedDataOptions = {
  readonly fixtureKeys?: readonly string[]
  readonly ingestBaseUrl: string
  readonly timeScale: number
  readonly provisionSystemQueues: boolean
  readonly countPerFixture: number
  readonly parallelTraces: number
  readonly verboseSpans: boolean
  readonly seed?: string
}

export type BuildLiveSeedRunPlanOptions = {
  readonly fixtureKeys?: readonly string[]
  readonly countPerFixture: number
  readonly timeScale: number
  readonly seed: string
  readonly targets: SeedTargets
}

export type DispatchResolvedTracesOptions = {
  readonly ingestBaseUrl: string
  readonly parallelTraces: number
  readonly runId: string
  readonly verboseSpans?: boolean
  readonly postTraceSpan?: (input: {
    readonly trace: ResolvedLiveSeedTrace
    readonly span: BuiltTraceSpan
  }) => Promise<void>
}

export type DispatchResolvedTracesResult = {
  readonly elapsedMs: number
  readonly sentTraceCount: number
  readonly sentSpanCount: number
  readonly plannedSpanCount: number
}

type TraceDispatchContext = {
  readonly tags: readonly string[]
  readonly metadata: Readonly<Record<string, string>>
  readonly provider?: string
  readonly model?: string
  readonly scopeName?: string
  readonly scopeVersion?: string
}

function hashHex(input: string, length: number): string {
  return createHash("sha256").update(input).digest("hex").slice(0, length)
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function requireItem<T>(value: T | null | undefined, message: string): T {
  if (value === null || value === undefined) {
    throw new Error(message)
  }
  return value
}

function normalizeBaseUrl(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value
}

function formatDuration(ms: number): string {
  if (ms < 1_000) {
    return `${ms.toString()}ms`
  }
  if (ms < 60_000) {
    const seconds = ms / 1_000
    return `${seconds >= 10 ? seconds.toFixed(0) : seconds.toFixed(1)}s`
  }

  const minutes = Math.floor(ms / 60_000)
  const seconds = ((ms % 60_000) / 1_000).toFixed(0).padStart(2, "0")
  return `${minutes.toString()}m${seconds}s`
}

function formatRate(count: number, elapsedMs: number): string {
  if (count <= 0 || elapsedMs <= 0) {
    return "0/s"
  }

  const rate = count / (elapsedMs / 1_000)
  return `${rate >= 10 ? rate.toFixed(0) : rate.toFixed(1)}/s`
}

function getPlannedSpanCount(traces: readonly ResolvedLiveSeedTrace[]): number {
  return traces.reduce((sum, trace) => sum + trace.generatedTrace.spans.length, 0)
}

function labelForEvaluation(evaluationId: string): string {
  const label = EVALUATION_LABELS[evaluationId]
  if (!label) {
    throw new Error(`Missing evaluation label for ${evaluationId}`)
  }
  return label
}

function resolveSelectedFixtures(keys?: readonly string[]): readonly LiveSeedFixtureDefinition[] {
  if (!keys || keys.length === 0) {
    return liveSeedFixtures
  }

  const fixturesByKey = new Map(liveSeedFixtures.map((fixture) => [fixture.key, fixture]))

  return keys.map((key) => {
    const fixture = fixturesByKey.get(key)
    if (!fixture) {
      throw new Error(`Unknown fixture "${key}". Valid fixtures: ${[...liveSeedFixtureKeys].sort().join(", ")}`)
    }
    return fixture
  })
}

function runIdForSeed(seed: string): string {
  return hashHex(`seed-live-seeds:${seed}`, 8)
}

function getAgentProfile(serviceName: string): AgentProfile {
  const profile = AGENT_PROFILES.find((candidate) => candidate.serviceName === serviceName)
  if (!profile) {
    throw new Error(`Missing seeded agent profile for service "${serviceName}"`)
  }
  return profile
}

function buildSeedStyleMetadata(
  profile: AgentProfile,
  environment: string,
  fixtureKey: string,
  rng: ReturnType<typeof createSeededRng>,
): Readonly<Record<string, string>> {
  const metadata: Record<string, string> = {
    environment,
    sdk_version: rng.pick(["1.2.0", "1.3.1", "2.0.0-beta"]),
    live_seed_fixture: fixtureKey,
  }

  if (rng.chance(0.6)) {
    metadata.region = rng.pick(["us-desert-southwest", "us-mountain-west", "mars-colony-1", "eu-west-1"])
  }
  if (profile.tag === "support" && rng.chance(0.7)) {
    metadata.product_category = rng.pick([
      "explosives",
      "propulsion",
      "traps",
      "disguises",
      "construction",
      "miscellaneous",
    ])
    metadata.customer_tier = rng.pick(["super-genius", "standard", "premium"])
    metadata.channel = rng.pick(["web", "mobile", "api", "smoke-signal"])
  }
  if (profile.tag === "internal-kb" || profile.tag === "product-copywriting") {
    metadata.customer_tier = "employee"
  }

  return metadata
}

function buildTraceDispatchContext(trace: ResolvedLiveSeedTrace): TraceDispatchContext {
  const profile = getAgentProfile(trace.generatedTrace.serviceName)
  const rng = createSeededRng(
    `dispatch-context:${trace.traceId}:${trace.fixture.key}:${trace.instanceIndex.toString()}`,
  )
  const environment = rng.pick(profile.environments)
  const model = profile.models.length > 0 ? rng.pick(profile.models) : undefined

  return {
    tags: [profile.tag, environment, "live-seed"],
    metadata: buildSeedStyleMetadata(profile, environment, trace.fixture.key, rng),
    ...(trace.generatedTrace.provider
      ? { provider: trace.generatedTrace.provider }
      : model
        ? { provider: model.provider }
        : {}),
    ...(trace.generatedTrace.model ? { model: trace.generatedTrace.model } : model ? { model: model.model } : {}),
    ...(trace.generatedTrace.scopeName
      ? { scopeName: trace.generatedTrace.scopeName }
      : model?.scopeName
        ? { scopeName: model.scopeName }
        : {}),
    ...(trace.generatedTrace.scopeVersion
      ? { scopeVersion: trace.generatedTrace.scopeVersion }
      : model
        ? { scopeVersion: "1.0.0" }
        : {}),
  }
}

async function provisionSystemQueues(): Promise<void> {
  const client = createPostgresClient()

  try {
    const results = await Effect.runPromise(
      provisionSystemQueuesUseCase({
        organizationId: SEED_ORG_ID,
        projectId: SEED_PROJECT_ID,
      }).pipe(withPostgres(AnnotationQueueRepositoryLive, client, SEED_ORG_ID)),
    )

    console.log("[provision] System queues")
    for (const result of results) {
      console.log(`  - ${result.queueSlug}: ${result.action}`)
    }
  } finally {
    await closePostgres(client.pool)
  }
}

async function loadSeedTargets(): Promise<SeedTargets> {
  const client = createPostgresClient()

  try {
    const { evaluations, liveQueues, systemQueues } = await Effect.runPromise(
      Effect.gen(function* () {
        const evaluationRepository = yield* EvaluationRepository
        const queueRepository = yield* AnnotationQueueRepository

        return {
          evaluations: yield* evaluationRepository.listByProjectId({
            projectId: SEED_PROJECT_ID,
            options: {
              lifecycle: "active",
              limit: 100,
            },
          }),
          liveQueues: yield* queueRepository.listLiveQueuesByProject({
            projectId: SEED_PROJECT_ID,
          }),
          systemQueues: yield* queueRepository.listSystemQueuesByProject({
            projectId: SEED_PROJECT_ID,
          }),
        }
      }).pipe(
        withPostgres(Layer.mergeAll(EvaluationRepositoryLive, AnnotationQueueRepositoryLive), client, SEED_ORG_ID),
      ),
    )

    const evaluationsById = Object.fromEntries(
      evaluations.items
        .filter((evaluation) => SEEDED_EVALUATION_ID_SET.has(evaluation.id))
        .map((evaluation) => [evaluation.id, evaluation]),
    )

    for (const evaluationId of SEEDED_EVALUATION_ORDER) {
      requireItem(
        evaluationsById[evaluationId],
        `Missing seeded active evaluation ${labelForEvaluation(evaluationId)} (${evaluationId})`,
      )
    }

    const highCostLiveQueue = requireItem(
      liveQueues.find((queue) => queue.slug === HIGH_COST_LIVE_QUEUE_SLUG),
      `Missing live queue "${HIGH_COST_LIVE_QUEUE_SLUG}" in seeded project`,
    )

    requireItem(
      systemQueues.find((queue) => queue.slug === FRUSTRATION_SYSTEM_QUEUE_SLUG),
      `Missing system queue "${FRUSTRATION_SYSTEM_QUEUE_SLUG}" in seeded project`,
    )

    return {
      evaluationsById,
      highCostLiveQueue,
      systemQueuesBySlug: Object.fromEntries(systemQueues.map((queue) => [queue.slug, queue])),
    }
  } finally {
    await closePostgres(client.pool)
  }
}

async function sampleLiveEvaluation(target: Evaluation, traceId: string): Promise<boolean> {
  return deterministicSampling({
    sampling: target.trigger.sampling,
    keyParts: [SEED_ORG_ID, SEED_PROJECT_ID, target.id, traceId],
  })
}

async function sampleLiveQueue(target: AnnotationQueue, traceId: string): Promise<boolean> {
  return deterministicSampling({
    sampling: target.settings.sampling ?? LIVE_QUEUE_DEFAULT_SAMPLING,
    keyParts: [SEED_ORG_ID, SEED_PROJECT_ID, target.id, traceId],
  })
}

async function sampleSystemQueue(target: AnnotationQueue, traceId: string): Promise<boolean> {
  return deterministicSampling({
    sampling: target.settings.sampling ?? 0,
    keyParts: [SEED_ORG_ID, SEED_PROJECT_ID, traceId, target.slug],
  })
}

async function computeSamplePreview(
  fixture: LiveSeedFixtureDefinition,
  targets: SeedTargets,
  traceId: string,
): Promise<LiveSeedSamplePreview> {
  const evaluationEntries = await Promise.all(
    SEEDED_EVALUATION_ORDER.map(async (evaluationId) => {
      const evaluation = targets.evaluationsById[evaluationId]
      const sampled = await sampleLiveEvaluation(evaluation, traceId)
      return [EVALUATION_LABELS[evaluationId], sampled] as const
    }),
  )

  const liveQueue =
    fixture.sampling.liveQueueSample === undefined
      ? undefined
      : await sampleLiveQueue(targets.highCostLiveQueue, traceId)

  const systemQueues =
    fixture.sampling.systemQueueSamples === undefined
      ? undefined
      : Object.fromEntries(
          await Promise.all(
            Object.entries(fixture.sampling.systemQueueSamples).map(async ([queueSlug]) => {
              const queue = requireItem(
                targets.systemQueuesBySlug[queueSlug],
                `Missing provisioned system queue "${queueSlug}" in seeded project`,
              )
              return [queueSlug, await sampleSystemQueue(queue, traceId)] as const
            }),
          ),
        )

  return {
    evaluations: Object.fromEntries(evaluationEntries),
    ...(liveQueue === undefined ? {} : { liveQueue }),
    ...(systemQueues === undefined ? {} : { systemQueues }),
  }
}

function samplePreviewMatchesRequirements(fixture: LiveSeedFixtureDefinition, preview: LiveSeedSamplePreview): boolean {
  const includeIds = fixture.sampling.includeEvaluationIds ?? []
  const excludeIds = fixture.sampling.excludeEvaluationIds ?? []

  for (const evaluationId of includeIds) {
    if (!preview.evaluations[labelForEvaluation(evaluationId)]) {
      return false
    }
  }

  for (const evaluationId of excludeIds) {
    if (preview.evaluations[labelForEvaluation(evaluationId)]) {
      return false
    }
  }

  if (fixture.sampling.liveQueueSample !== undefined && preview.liveQueue !== fixture.sampling.liveQueueSample) {
    return false
  }

  if (fixture.sampling.systemQueueSamples !== undefined) {
    for (const [queueSlug, expectedSample] of Object.entries(fixture.sampling.systemQueueSamples)) {
      if (preview.systemQueues?.[queueSlug] !== expectedSample) {
        return false
      }
    }
  }

  return true
}

async function findTraceIdForFixtureInstance(
  fixture: LiveSeedFixtureDefinition,
  targets: SeedTargets,
  runSeed: string,
  instanceIndex: number,
): Promise<{ readonly traceId: string; readonly preview: LiveSeedSamplePreview }> {
  for (let attempt = 0; attempt < MAX_TRACE_ID_SEARCH_ATTEMPTS; attempt += 1) {
    const traceId = hashHex(
      `seed-live-seeds:${runSeed}:${fixture.key}:${instanceIndex.toString()}:${attempt.toString()}`,
      32,
    )
    const preview = await computeSamplePreview(fixture, targets, traceId)

    if (samplePreviewMatchesRequirements(fixture, preview)) {
      return { traceId, preview }
    }
  }

  throw new Error(
    `Unable to find a traceId for fixture "${fixture.key}" instance ${instanceIndex.toString()} after ${MAX_TRACE_ID_SEARCH_ATTEMPTS.toString()} attempts`,
  )
}

function scaleMs(value: number, timeScale: number, minimumMs = 0): number {
  return Math.max(minimumMs, Math.round(value * timeScale))
}

function scaleGeneratedTrace(trace: LiveSeedGeneratedTrace, timeScale: number): LiveSeedGeneratedTrace {
  return {
    ...trace,
    startDelayMs: scaleMs(trace.startDelayMs, timeScale),
    spans: trace.spans.map((span) => ({
      ...span,
      offsetMs: scaleMs(span.offsetMs, timeScale),
      durationMs: scaleMs(span.durationMs, timeScale, 250),
    })),
  }
}

function getTraceDispatchWindowMs(trace: LiveSeedGeneratedTrace): number {
  const spanWindowMs = trace.spans.reduce(
    (currentMax, span) => Math.max(currentMax, span.offsetMs + span.durationMs),
    0,
  )
  return trace.startDelayMs + spanWindowMs
}

export async function buildLiveSeedRunPlan(options: BuildLiveSeedRunPlanOptions): Promise<LiveSeedRunPlan> {
  const fixtures = resolveSelectedFixtures(options.fixtureKeys)
  const runId = runIdForSeed(options.seed)

  const traces = await Promise.all(
    fixtures.flatMap((fixture) =>
      Array.from({ length: options.countPerFixture }, async (_, instanceIndex) => {
        const rng = createSeededRng(`${options.seed}:${fixture.key}:${instanceIndex.toString()}`)
        const generatedTrace = scaleGeneratedTrace(
          fixture.generateTrace({
            rng,
            fixtureKey: fixture.key,
            instanceIndex,
            runSeed: options.seed,
          }),
          options.timeScale,
        )
        const { traceId, preview } = await findTraceIdForFixtureInstance(
          fixture,
          options.targets,
          options.seed,
          instanceIndex,
        )

        return {
          fixture,
          instanceIndex,
          generatedTrace,
          traceId,
          samples: preview,
        } satisfies ResolvedLiveSeedTrace
      }),
    ),
  )

  return {
    seed: options.seed,
    runId,
    traces,
  }
}

function printFixturePlan(plan: LiveSeedRunPlan, ingestBaseUrl: string, provisioned: boolean, parallelTraces: number) {
  const plannedSpanCount = getPlannedSpanCount(plan.traces)

  console.log("[plan] Live-seed run")
  console.log(`  - ingest endpoint: ${normalizeBaseUrl(ingestBaseUrl)}/v1/traces`)
  console.log(`  - project slug: ${SEED_PROJECT_SLUG}`)
  console.log(`  - system queue provisioning: ${provisioned ? "enabled" : "skipped"}`)
  console.log(`  - trace-end debounce: ${Math.ceil(TRACE_END_DEBOUNCE_MS / 1000).toString()}s`)
  console.log(`  - runId: ${plan.runId}`)
  console.log(`  - seed: ${plan.seed}`)
  console.log(`  - total traces: ${plan.traces.length.toString()}`)
  console.log(`  - planned spans: ${plannedSpanCount.toString()}`)
  console.log(`  - parallel trace runners: ${parallelTraces.toString()}`)

  for (const fixture of liveSeedFixtures) {
    const matchingTraces = plan.traces.filter((trace) => trace.fixture.key === fixture.key)
    if (matchingTraces.length === 0) {
      continue
    }

    const example = matchingTraces[0]
    const spanCounts = matchingTraces.map((trace) => trace.generatedTrace.spans.length)
    const traceWindows = matchingTraces.map((trace) => getTraceDispatchWindowMs(trace.generatedTrace))

    console.log(`\n  - fixture=${fixture.key} traces=${matchingTraces.length.toString()}`)
    console.log(`    example traceId: ${example.traceId}`)
    console.log(`    service: ${example.generatedTrace.serviceName}`)
    console.log(`    span count range: ${Math.min(...spanCounts).toString()}-${Math.max(...spanCounts).toString()}`)
    console.log(
      `    dispatch window range: ${Math.min(...traceWindows).toString()}-${Math.max(...traceWindows).toString()}ms`,
    )
    console.log(
      `    live evaluations: ${Object.entries(example.samples.evaluations)
        .map(([label, sampled]) => `${label}=${sampled ? "in" : "out"}`)
        .join(", ")}`,
    )
    if (example.samples.liveQueue !== undefined) {
      console.log(`    high-cost live queue sample: ${example.samples.liveQueue ? "in" : "out"}`)
    }
    if (example.samples.systemQueues !== undefined) {
      console.log(
        `    system queue samples: ${Object.entries(example.samples.systemQueues)
          .map(([queueSlug, sampled]) => `${queueSlug}=${sampled ? "in" : "out"}`)
          .join(", ")}`,
      )
    }
    if (fixture.deterministicSystemMatches.length > 0) {
      console.log(`    deterministic system matches: ${fixture.deterministicSystemMatches.join(", ")}`)
    }
    if (fixture.llmSystemIntents.length > 0) {
      console.log(`    LLM system intents: ${fixture.llmSystemIntents.join(", ")}`)
    }
  }
}

async function postSpanToIngest(
  ingestBaseUrl: string,
  traceId: string,
  request: BuiltTraceSpan["request"],
): Promise<void> {
  const response = await fetch(`${normalizeBaseUrl(ingestBaseUrl)}/v1/traces`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SEED_API_KEY_TOKEN}`,
      "Content-Type": "application/json",
      "X-Latitude-Project": SEED_PROJECT_SLUG,
    },
    body: JSON.stringify(request),
  })

  if (response.status !== 202) {
    const body = await response.text()
    throw new Error(`Failed to ingest trace ${traceId}: ${response.status} ${response.statusText}\n${body}`)
  }
}

async function runWithConcurrency<T>(
  values: readonly T[],
  concurrency: number,
  worker: (value: T) => Promise<void>,
): Promise<void> {
  let nextIndex = 0
  const workerCount = Math.max(1, Math.min(concurrency, values.length))

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (nextIndex < values.length) {
        const currentIndex = nextIndex
        nextIndex += 1
        const value = values[currentIndex]
        if (value !== undefined) {
          await worker(value)
        }
      }
    }),
  )
}

export async function dispatchResolvedTraces(
  traces: readonly ResolvedLiveSeedTrace[],
  options: DispatchResolvedTracesOptions,
): Promise<DispatchResolvedTracesResult> {
  const dispatchStartedAt = Date.now()
  const plannedSpanCount = getPlannedSpanCount(traces)
  let sentSpanCount = 0
  let completedTraceCount = 0
  let activeTraceCount = 0

  await runWithConcurrency(traces, options.parallelTraces, async (trace) => {
    activeTraceCount += 1
    const traceStartedAt = Date.now()
    const dispatchContext = buildTraceDispatchContext(trace)
    const builtSpans = buildTraceRequests({
      traceId: trace.traceId,
      sessionId: trace.generatedTrace.sessionId,
      userId: trace.generatedTrace.userId,
      serviceName: trace.generatedTrace.serviceName,
      spans: trace.generatedTrace.spans,
      systemInstructions: trace.generatedTrace.systemInstructions,
      tags: dispatchContext.tags,
      metadata: dispatchContext.metadata,
      baseTime: new Date(traceStartedAt + trace.generatedTrace.startDelayMs),
      ...(dispatchContext.provider ? { provider: dispatchContext.provider } : {}),
      ...(dispatchContext.model ? { model: dispatchContext.model } : {}),
      ...(dispatchContext.scopeName ? { scopeName: dispatchContext.scopeName } : {}),
      ...(dispatchContext.scopeVersion ? { scopeVersion: dispatchContext.scopeVersion } : {}),
    })

    try {
      for (const span of builtSpans) {
        const dueAt = traceStartedAt + trace.generatedTrace.startDelayMs + span.emitAtMs
        const sleepFor = Math.max(0, dueAt - Date.now())

        if (sleepFor > 0) {
          await sleep(sleepFor)
        }

        if (options.postTraceSpan) {
          await options.postTraceSpan({ trace, span })
        } else {
          await postSpanToIngest(options.ingestBaseUrl, trace.traceId, span.request)
        }

        sentSpanCount += 1
        if (options.verboseSpans) {
          console.log(
            `[span] fixture=${trace.fixture.key} index=${trace.instanceIndex.toString()} label=${span.label} trace=${trace.traceId} span=${span.spanId} sent=${sentSpanCount.toString()}/${plannedSpanCount.toString()}`,
          )
        }
      }

      completedTraceCount += 1
      activeTraceCount -= 1
      const elapsedMs = Date.now() - traceStartedAt
      const totalElapsedMs = Date.now() - dispatchStartedAt

      console.log(
        `[trace] completed fixture=${trace.fixture.key} index=${trace.instanceIndex.toString()} spans=${builtSpans.length.toString()} elapsed=${formatDuration(elapsedMs)} trace=${trace.traceId}`,
      )
      console.log(
        `[progress] traces=${completedTraceCount.toString()}/${traces.length.toString()} spans=${sentSpanCount.toString()}/${plannedSpanCount.toString()} active=${activeTraceCount.toString()} elapsed=${formatDuration(totalElapsedMs)} rate=${formatRate(sentSpanCount, totalElapsedMs)}`,
      )
    } catch (error) {
      activeTraceCount -= 1
      console.error(
        `[trace] failed fixture=${trace.fixture.key} index=${trace.instanceIndex.toString()} trace=${trace.traceId}`,
      )
      throw error
    }
  })

  return {
    elapsedMs: Date.now() - dispatchStartedAt,
    sentTraceCount: traces.length,
    sentSpanCount,
    plannedSpanCount,
  }
}

export function printFixtureCatalog(): void {
  console.log("[fixtures] Available live-seed fixtures")
  for (const fixture of liveSeedFixtures) {
    console.log(`  - ${fixture.key}: ${fixture.description}`)
  }
}

export async function sendLiveSeedData(options: SendLiveSeedDataOptions): Promise<void> {
  const seed = options.seed ?? randomUUID().replaceAll("-", "")

  if (options.provisionSystemQueues) {
    await provisionSystemQueues()
  }

  const targets = await loadSeedTargets()
  const plan = await buildLiveSeedRunPlan({
    ...(options.fixtureKeys ? { fixtureKeys: options.fixtureKeys } : {}),
    countPerFixture: options.countPerFixture,
    timeScale: options.timeScale,
    seed,
    targets,
  })

  printFixturePlan(plan, options.ingestBaseUrl, options.provisionSystemQueues, options.parallelTraces)

  const plannedSpanCount = getPlannedSpanCount(plan.traces)
  console.log(
    `\n[send] Dispatching ${plan.traces.length.toString()} traces (${plannedSpanCount.toString()} spans planned) across ${resolveSelectedFixtures(options.fixtureKeys).length.toString()} fixtures...`,
  )
  const dispatchResult = await dispatchResolvedTraces(plan.traces, {
    ingestBaseUrl: options.ingestBaseUrl,
    parallelTraces: options.parallelTraces,
    runId: plan.runId,
    verboseSpans: options.verboseSpans,
  })

  console.log(
    `\n[done] Sent ${dispatchResult.sentTraceCount.toString()} traces and ${dispatchResult.sentSpanCount.toString()}/${dispatchResult.plannedSpanCount.toString()} spans in ${formatDuration(dispatchResult.elapsedMs)} (${formatRate(dispatchResult.sentSpanCount, dispatchResult.elapsedMs)}).`,
  )
  console.log(
    `[done] Allow at least ${Math.ceil((TRACE_END_DEBOUNCE_MS + dispatchResult.elapsedMs) / 1000).toString()}s from script start for every trace to become eligible for TraceEnded on this branch.`,
  )
  console.log(
    `[done] Use runId=${plan.runId} and seed=${plan.seed} to correlate generated traces with downstream worker logs.`,
  )
}
