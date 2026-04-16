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
import { type BuiltTraceSpan, buildTraceRequests, type SeedSpanDefinition } from "./otlp.ts"
import { createSeededRng } from "./random.ts"
import type {
  LiveSeedFixtureDefinition,
  LiveSeedGeneratedCase,
  LiveSeedGeneratedCaseTrace,
  SamplingPlan,
} from "./types.ts"

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
  readonly evaluationsById: Readonly<Record<string, boolean>>
  readonly liveQueue: boolean
  readonly systemQueuesBySlug: Readonly<Record<string, boolean>>
}

export type ResolvedLiveSeedTrace = {
  readonly fixture: LiveSeedFixtureDefinition
  readonly caseIndex: number
  readonly traceIndex: number
  readonly sessionId: string
  readonly userId: string
  readonly generatedTrace: LiveSeedGeneratedCaseTrace
  readonly traceId: string
  readonly samples: LiveSeedSamplePreview
}

export type ResolvedLiveSeedCase = {
  readonly fixture: LiveSeedFixtureDefinition
  readonly caseIndex: number
  readonly sessionId: string
  readonly userId: string
  readonly traces: readonly ResolvedLiveSeedTrace[]
}

export type LiveSeedRunPlan = {
  readonly seed: string
  readonly runId: string
  readonly cases: readonly ResolvedLiveSeedCase[]
}

export type SendLiveSeedDataOptions = {
  readonly fixtureKeys?: readonly string[]
  readonly ingestBaseUrl: string
  readonly timeScale: number
  readonly provisionSystemQueues: boolean
  readonly countPerFixture: number
  readonly parallelCases: number
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

export type DispatchResolvedCasesOptions = {
  readonly ingestBaseUrl: string
  readonly parallelCases: number
  readonly runId: string
  readonly verboseSpans?: boolean
  readonly postTraceSpan?: (input: {
    readonly seedCase: ResolvedLiveSeedCase
    readonly trace: ResolvedLiveSeedTrace
    readonly span: BuiltTraceSpan
  }) => Promise<void>
}

export type DispatchResolvedCasesResult = {
  readonly elapsedMs: number
  readonly sentCaseCount: number
  readonly sentTraceCount: number
  readonly sentSpanCount: number
  readonly plannedTraceCount: number
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

type ScheduledTraceSpan = {
  readonly seedCase: ResolvedLiveSeedCase
  readonly trace: ResolvedLiveSeedTrace
  readonly span: BuiltTraceSpan
  readonly dueAt: number
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

function getTraceSpanCount(trace: ResolvedLiveSeedTrace): number {
  return trace.generatedTrace.spans.length
}

function getCaseSpanCount(seedCase: ResolvedLiveSeedCase): number {
  return seedCase.traces.reduce((sum, trace) => sum + getTraceSpanCount(trace), 0)
}

function getPlannedTraceCount(cases: readonly ResolvedLiveSeedCase[]): number {
  return cases.reduce((sum, seedCase) => sum + seedCase.traces.length, 0)
}

function getPlannedSpanCount(cases: readonly ResolvedLiveSeedCase[]): number {
  return cases.reduce((sum, seedCase) => sum + getCaseSpanCount(seedCase), 0)
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
    `dispatch-context:${trace.traceId}:${trace.fixture.key}:${trace.caseIndex.toString()}:${trace.traceIndex.toString()}`,
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

async function computeSamplePreview(targets: SeedTargets, traceId: string): Promise<LiveSeedSamplePreview> {
  const evaluationsById = Object.fromEntries(
    await Promise.all(
      SEEDED_EVALUATION_ORDER.map(async (evaluationId) => {
        const evaluation = targets.evaluationsById[evaluationId]
        return [evaluationId, await sampleLiveEvaluation(evaluation, traceId)] as const
      }),
    ),
  )

  const liveQueue = await sampleLiveQueue(targets.highCostLiveQueue, traceId)
  const systemQueuesBySlug = Object.fromEntries(
    await Promise.all(
      Object.entries(targets.systemQueuesBySlug).map(async ([queueSlug, queue]) => {
        return [queueSlug, await sampleSystemQueue(queue, traceId)] as const
      }),
    ),
  )

  return {
    evaluationsById,
    liveQueue,
    systemQueuesBySlug,
  }
}

function buildContextSamplingPlan(fixture: LiveSeedFixtureDefinition, targets: SeedTargets): SamplingPlan {
  const contextSystemQueueSamples = Object.fromEntries(
    Object.keys(fixture.sampling.systemQueueSamples ?? {})
      .filter((queueSlug) => {
        const queue = targets.systemQueuesBySlug[queueSlug]
        return (queue?.settings.sampling ?? 0) < 100
      })
      .map((queueSlug) => [queueSlug, false]),
  )

  return {
    excludeEvaluationIds: SEEDED_EVALUATION_ORDER,
    liveQueueSample: false,
    ...(Object.keys(contextSystemQueueSamples).length > 0 ? { systemQueueSamples: contextSystemQueueSamples } : {}),
  }
}

function samplePreviewMatchesPlan(plan: SamplingPlan, preview: LiveSeedSamplePreview): boolean {
  for (const evaluationId of plan.includeEvaluationIds ?? []) {
    if (!preview.evaluationsById[evaluationId]) {
      return false
    }
  }

  for (const evaluationId of plan.excludeEvaluationIds ?? []) {
    if (preview.evaluationsById[evaluationId]) {
      return false
    }
  }

  if (plan.liveQueueSample !== undefined && preview.liveQueue !== plan.liveQueueSample) {
    return false
  }

  for (const [queueSlug, expectedSample] of Object.entries(plan.systemQueueSamples ?? {})) {
    if (preview.systemQueuesBySlug[queueSlug] !== expectedSample) {
      return false
    }
  }

  return true
}

function validateGeneratedCase(
  fixture: LiveSeedFixtureDefinition,
  generatedCase: LiveSeedGeneratedCase,
  caseIndex: number,
): void {
  if (generatedCase.traces.length === 0) {
    throw new Error(`Fixture "${fixture.key}" case ${caseIndex.toString()} generated no traces`)
  }

  const targetTraceCount = generatedCase.traces.filter((trace) => trace.role === "target").length
  if (targetTraceCount !== 1) {
    throw new Error(
      `Fixture "${fixture.key}" case ${caseIndex.toString()} must generate exactly one target trace, received ${targetTraceCount.toString()}`,
    )
  }

  const traceKeys = new Set<string>()
  for (const trace of generatedCase.traces) {
    if (trace.spans.length === 0) {
      throw new Error(`Fixture "${fixture.key}" case ${caseIndex.toString()} trace "${trace.key}" generated no spans`)
    }
    if (traceKeys.has(trace.key)) {
      throw new Error(
        `Fixture "${fixture.key}" case ${caseIndex.toString()} generated duplicate trace key "${trace.key}"`,
      )
    }
    traceKeys.add(trace.key)
  }
}

async function findTraceIdForCaseTrace(input: {
  readonly fixture: LiveSeedFixtureDefinition
  readonly generatedTrace: LiveSeedGeneratedCaseTrace
  readonly targets: SeedTargets
  readonly runSeed: string
  readonly caseIndex: number
  readonly traceIndex: number
}): Promise<{ readonly traceId: string; readonly preview: LiveSeedSamplePreview }> {
  const samplingPlan =
    input.generatedTrace.role === "target"
      ? input.fixture.sampling
      : buildContextSamplingPlan(input.fixture, input.targets)

  for (let attempt = 0; attempt < MAX_TRACE_ID_SEARCH_ATTEMPTS; attempt += 1) {
    const traceId = hashHex(
      `seed-live-seeds:${input.runSeed}:${input.fixture.key}:${input.caseIndex.toString()}:${input.traceIndex.toString()}:${input.generatedTrace.key}:${attempt.toString()}`,
      32,
    )
    const preview = await computeSamplePreview(input.targets, traceId)

    if (samplePreviewMatchesPlan(samplingPlan, preview)) {
      return { traceId, preview }
    }
  }

  throw new Error(
    `Unable to find a traceId for fixture "${input.fixture.key}" case ${input.caseIndex.toString()} trace "${input.generatedTrace.key}" after ${MAX_TRACE_ID_SEARCH_ATTEMPTS.toString()} attempts`,
  )
}

function scaleMs(value: number, timeScale: number, minimumMs = 0): number {
  return Math.max(minimumMs, Math.round(value * timeScale))
}

function scaleGeneratedSpan(span: SeedSpanDefinition, timeScale: number): SeedSpanDefinition {
  return {
    ...span,
    offsetMs: scaleMs(span.offsetMs, timeScale),
    durationMs: scaleMs(span.durationMs, timeScale, 250),
  }
}

function scaleGeneratedCaseTrace(trace: LiveSeedGeneratedCaseTrace, timeScale: number): LiveSeedGeneratedCaseTrace {
  return {
    ...trace,
    startDelayMs: scaleMs(trace.startDelayMs, timeScale),
    spans: trace.spans.map((span) => scaleGeneratedSpan(span, timeScale)),
  }
}

function scaleGeneratedCase(generatedCase: LiveSeedGeneratedCase, timeScale: number): LiveSeedGeneratedCase {
  return {
    ...generatedCase,
    traces: generatedCase.traces.map((trace) => scaleGeneratedCaseTrace(trace, timeScale)),
  }
}

function getTraceDispatchWindowMs(trace: LiveSeedGeneratedCaseTrace): number {
  const spanWindowMs = trace.spans.reduce(
    (currentMax, span) => Math.max(currentMax, span.offsetMs + span.durationMs),
    0,
  )
  return trace.startDelayMs + spanWindowMs
}

function getCaseDispatchWindowMs(seedCase: ResolvedLiveSeedCase): number {
  return seedCase.traces.reduce(
    (currentMax, trace) => Math.max(currentMax, getTraceDispatchWindowMs(trace.generatedTrace)),
    0,
  )
}

export async function buildLiveSeedRunPlan(options: BuildLiveSeedRunPlanOptions): Promise<LiveSeedRunPlan> {
  const fixtures = resolveSelectedFixtures(options.fixtureKeys)
  const runId = runIdForSeed(options.seed)

  const cases = await Promise.all(
    fixtures.flatMap((fixture) =>
      Array.from({ length: options.countPerFixture }, async (_, caseIndex) => {
        const rng = createSeededRng(`${options.seed}:${fixture.key}:${caseIndex.toString()}`)
        const generatedCase = scaleGeneratedCase(
          fixture.generateCase({
            rng,
            fixtureKey: fixture.key,
            instanceIndex: caseIndex,
            runSeed: options.seed,
          }),
          options.timeScale,
        )

        validateGeneratedCase(fixture, generatedCase, caseIndex)

        const traces = await Promise.all(
          generatedCase.traces.map(async (generatedTrace, traceIndex) => {
            const { traceId, preview } = await findTraceIdForCaseTrace({
              fixture,
              generatedTrace,
              targets: options.targets,
              runSeed: options.seed,
              caseIndex,
              traceIndex,
            })

            return {
              fixture,
              caseIndex,
              traceIndex,
              sessionId: generatedCase.sessionId,
              userId: generatedCase.userId,
              generatedTrace,
              traceId,
              samples: preview,
            } satisfies ResolvedLiveSeedTrace
          }),
        )

        return {
          fixture,
          caseIndex,
          sessionId: generatedCase.sessionId,
          userId: generatedCase.userId,
          traces,
        } satisfies ResolvedLiveSeedCase
      }),
    ),
  )

  return {
    seed: options.seed,
    runId,
    cases,
  }
}

function formatEvaluationSamples(preview: LiveSeedSamplePreview): string {
  return SEEDED_EVALUATION_ORDER.map((evaluationId) => {
    return `${labelForEvaluation(evaluationId)}=${preview.evaluationsById[evaluationId] ? "in" : "out"}`
  }).join(", ")
}

function formatSystemQueueSamples(
  preview: LiveSeedSamplePreview,
  fixture: LiveSeedFixtureDefinition,
): string | undefined {
  const relevantQueueSlugs = Object.keys(fixture.sampling.systemQueueSamples ?? {})
  if (relevantQueueSlugs.length === 0) {
    return undefined
  }

  return relevantQueueSlugs
    .map((queueSlug) => `${queueSlug}=${preview.systemQueuesBySlug[queueSlug] ? "in" : "out"}`)
    .join(", ")
}

function printFixturePlan(plan: LiveSeedRunPlan, ingestBaseUrl: string, provisioned: boolean, parallelCases: number) {
  const plannedTraceCount = getPlannedTraceCount(plan.cases)
  const plannedSpanCount = getPlannedSpanCount(plan.cases)

  console.log("[plan] Live-seed run")
  console.log(`  - ingest endpoint: ${normalizeBaseUrl(ingestBaseUrl)}/v1/traces`)
  console.log(`  - project slug: ${SEED_PROJECT_SLUG}`)
  console.log(`  - system queue provisioning: ${provisioned ? "enabled" : "skipped"}`)
  console.log(`  - trace-end debounce: ${Math.ceil(TRACE_END_DEBOUNCE_MS / 1000).toString()}s`)
  console.log(`  - runId: ${plan.runId}`)
  console.log(`  - seed: ${plan.seed}`)
  console.log(`  - total cases: ${plan.cases.length.toString()}`)
  console.log(`  - total traces: ${plannedTraceCount.toString()}`)
  console.log(`  - planned spans: ${plannedSpanCount.toString()}`)
  console.log(`  - parallel case runners: ${parallelCases.toString()}`)

  for (const fixture of liveSeedFixtures) {
    const matchingCases = plan.cases.filter((seedCase) => seedCase.fixture.key === fixture.key)
    if (matchingCases.length === 0) {
      continue
    }

    const exampleCase = matchingCases[0]
    const targetTrace = requireItem(
      exampleCase.traces.find((trace) => trace.generatedTrace.role === "target"),
      `Fixture "${fixture.key}" example case is missing a target trace`,
    )
    const tracesPerCase = matchingCases.map((seedCase) => seedCase.traces.length)
    const spansPerCase = matchingCases.map((seedCase) => getCaseSpanCount(seedCase))
    const dispatchWindows = matchingCases.map((seedCase) => getCaseDispatchWindowMs(seedCase))

    console.log(`\n  - fixture=${fixture.key} cases=${matchingCases.length.toString()}`)
    console.log(
      `    traces per case: ${Math.min(...tracesPerCase).toString()}-${Math.max(...tracesPerCase).toString()}`,
    )
    console.log(`    spans per case: ${Math.min(...spansPerCase).toString()}-${Math.max(...spansPerCase).toString()}`)
    console.log(
      `    dispatch window range: ${Math.min(...dispatchWindows).toString()}-${Math.max(...dispatchWindows).toString()}ms`,
    )
    console.log(`    example target traceId: ${targetTrace.traceId}`)
    console.log(`    target service: ${targetTrace.generatedTrace.serviceName}`)
    console.log(`    live evaluations: ${formatEvaluationSamples(targetTrace.samples)}`)
    if (fixture.sampling.liveQueueSample !== undefined) {
      console.log(`    high-cost live queue sample: ${targetTrace.samples.liveQueue ? "in" : "out"}`)
    }
    const systemQueueSamples = formatSystemQueueSamples(targetTrace.samples, fixture)
    if (systemQueueSamples) {
      console.log(`    system queue samples: ${systemQueueSamples}`)
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

function buildScheduledSpansForCase(
  seedCase: ResolvedLiveSeedCase,
  caseStartedAt: number,
): readonly ScheduledTraceSpan[] {
  const scheduledSpans = seedCase.traces.flatMap((trace) => {
    const dispatchContext = buildTraceDispatchContext(trace)
    const builtSpans = buildTraceRequests({
      traceId: trace.traceId,
      sessionId: seedCase.sessionId,
      userId: seedCase.userId,
      serviceName: trace.generatedTrace.serviceName,
      spans: trace.generatedTrace.spans,
      systemInstructions: trace.generatedTrace.systemInstructions,
      tags: dispatchContext.tags,
      metadata: dispatchContext.metadata,
      baseTime: new Date(caseStartedAt + trace.generatedTrace.startDelayMs),
      ...(dispatchContext.provider ? { provider: dispatchContext.provider } : {}),
      ...(dispatchContext.model ? { model: dispatchContext.model } : {}),
      ...(dispatchContext.scopeName ? { scopeName: dispatchContext.scopeName } : {}),
      ...(dispatchContext.scopeVersion ? { scopeVersion: dispatchContext.scopeVersion } : {}),
    })

    return builtSpans.map((span) => ({
      seedCase,
      trace,
      span,
      dueAt: caseStartedAt + trace.generatedTrace.startDelayMs + span.emitAtMs,
    }))
  })

  return [...scheduledSpans].sort((left, right) => left.dueAt - right.dueAt)
}

export async function dispatchResolvedCases(
  cases: readonly ResolvedLiveSeedCase[],
  options: DispatchResolvedCasesOptions,
): Promise<DispatchResolvedCasesResult> {
  const dispatchStartedAt = Date.now()
  const plannedTraceCount = getPlannedTraceCount(cases)
  const plannedSpanCount = getPlannedSpanCount(cases)
  let sentSpanCount = 0
  let completedTraceCount = 0
  let completedCaseCount = 0
  let activeCaseCount = 0

  await runWithConcurrency(cases, options.parallelCases, async (seedCase) => {
    activeCaseCount += 1
    const caseStartedAt = Date.now()
    const scheduledSpans = buildScheduledSpansForCase(seedCase, caseStartedAt)
    const remainingSpansByTrace = new Map(
      seedCase.traces.map((trace) => [trace.traceId, getTraceSpanCount(trace)] as const),
    )

    try {
      for (const scheduled of scheduledSpans) {
        const sleepFor = Math.max(0, scheduled.dueAt - Date.now())

        if (sleepFor > 0) {
          await sleep(sleepFor)
        }

        if (options.postTraceSpan) {
          await options.postTraceSpan({
            seedCase: scheduled.seedCase,
            trace: scheduled.trace,
            span: scheduled.span,
          })
        } else {
          await postSpanToIngest(options.ingestBaseUrl, scheduled.trace.traceId, scheduled.span.request)
        }

        sentSpanCount += 1
        if (options.verboseSpans) {
          console.log(
            `[span] fixture=${scheduled.trace.fixture.key} case=${scheduled.trace.caseIndex.toString()} trace=${scheduled.trace.traceId} traceKey=${scheduled.trace.generatedTrace.key} role=${scheduled.trace.generatedTrace.role} label=${scheduled.span.label} sent=${sentSpanCount.toString()}/${plannedSpanCount.toString()}`,
          )
        }

        const remainingSpans = (remainingSpansByTrace.get(scheduled.trace.traceId) ?? 1) - 1
        remainingSpansByTrace.set(scheduled.trace.traceId, remainingSpans)
        if (remainingSpans === 0) {
          completedTraceCount += 1
          const traceElapsedMs = Date.now() - (caseStartedAt + scheduled.trace.generatedTrace.startDelayMs)
          console.log(
            `[trace] completed fixture=${scheduled.trace.fixture.key} case=${scheduled.trace.caseIndex.toString()} traceIndex=${scheduled.trace.traceIndex.toString()} traceKey=${scheduled.trace.generatedTrace.key} role=${scheduled.trace.generatedTrace.role} spans=${getTraceSpanCount(scheduled.trace).toString()} elapsed=${formatDuration(traceElapsedMs)} trace=${scheduled.trace.traceId}`,
          )
        }
      }

      completedCaseCount += 1
      activeCaseCount -= 1
      const caseElapsedMs = Date.now() - caseStartedAt
      const totalElapsedMs = Date.now() - dispatchStartedAt

      console.log(
        `[case] completed fixture=${seedCase.fixture.key} case=${seedCase.caseIndex.toString()} traces=${seedCase.traces.length.toString()} spans=${getCaseSpanCount(seedCase).toString()} elapsed=${formatDuration(caseElapsedMs)} session=${seedCase.sessionId}`,
      )
      console.log(
        `[progress] cases=${completedCaseCount.toString()}/${cases.length.toString()} traces=${completedTraceCount.toString()}/${plannedTraceCount.toString()} spans=${sentSpanCount.toString()}/${plannedSpanCount.toString()} active=${activeCaseCount.toString()} elapsed=${formatDuration(totalElapsedMs)} rate=${formatRate(sentSpanCount, totalElapsedMs)}`,
      )
    } catch (error) {
      activeCaseCount -= 1
      console.error(`[case] failed fixture=${seedCase.fixture.key} case=${seedCase.caseIndex.toString()}`)
      throw error
    }
  })

  return {
    elapsedMs: Date.now() - dispatchStartedAt,
    sentCaseCount: cases.length,
    sentTraceCount: plannedTraceCount,
    sentSpanCount,
    plannedTraceCount,
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

  printFixturePlan(plan, options.ingestBaseUrl, options.provisionSystemQueues, options.parallelCases)

  const plannedTraceCount = getPlannedTraceCount(plan.cases)
  const plannedSpanCount = getPlannedSpanCount(plan.cases)
  console.log(
    `\n[send] Dispatching ${plan.cases.length.toString()} cases (${plannedTraceCount.toString()} traces, ${plannedSpanCount.toString()} spans planned) across ${resolveSelectedFixtures(options.fixtureKeys).length.toString()} fixtures...`,
  )
  const dispatchResult = await dispatchResolvedCases(plan.cases, {
    ingestBaseUrl: options.ingestBaseUrl,
    parallelCases: options.parallelCases,
    runId: plan.runId,
    verboseSpans: options.verboseSpans,
  })

  console.log(
    `\n[done] Sent ${dispatchResult.sentCaseCount.toString()} cases, ${dispatchResult.sentTraceCount.toString()} traces, and ${dispatchResult.sentSpanCount.toString()}/${dispatchResult.plannedSpanCount.toString()} spans in ${formatDuration(dispatchResult.elapsedMs)} (${formatRate(dispatchResult.sentSpanCount, dispatchResult.elapsedMs)}).`,
  )
  console.log(
    `[done] Allow at least ${Math.ceil((TRACE_END_DEBOUNCE_MS + dispatchResult.elapsedMs) / 1000).toString()}s from script start for every trace to become eligible for TraceEnded on this branch.`,
  )
  console.log(
    `[done] Use runId=${plan.runId} and seed=${plan.seed} to correlate generated traces with downstream worker logs.`,
  )
}
