import { createHash, randomUUID } from "node:crypto"
import {
  type AnnotationQueue,
  AnnotationQueueRepository,
  type Flagger,
  FlaggerRepository,
  LIVE_QUEUE_DEFAULT_SAMPLING,
  provisionFlaggersUseCase,
} from "@domain/annotation-queues"
import { type Evaluation, EvaluationRepository } from "@domain/evaluations"
import { createProject, ProjectRepository } from "@domain/projects"
import { deterministicSampling, type OrganizationId, type ProjectId } from "@domain/shared"
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
  FlaggerRepositoryLive,
  ProjectRepositoryLive,
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
const FRUSTRATION_FLAGGER_SLUG = "frustration"
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
  /**
   * High-cost live queue in the target project. `undefined` when running in
   * flaggers-only mode against a fresh project that hasn't been seeded
   * with the evaluation/live-queue fixtures — callers must guard access.
   */
  readonly highCostLiveQueue: AnnotationQueue | undefined
  readonly flaggersBySlug: Readonly<Record<string, Flagger>>
}

/**
 * Resolved run-time identity for a live-seeds invocation. The default flow
 * targets the seeded `Default Project`; when the CLI overrides the project
 * slug, we look up the project by slug (scoped to `SEED_ORG_ID`, the Acme
 * seed org) and enter `flaggersOnly` mode so the tool doesn't assert that
 * evaluations + the high-cost live queue exist in the target project.
 */
export type SeedRunContext = {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly projectSlug: string
  readonly apiKeyToken: string
  readonly flaggersOnly: boolean
}

/**
 * Fixtures whose sampling plan doesn't require seeded evaluations or a live
 * queue — safe to run against a fresh project that only has flaggers
 * provisioned. Derived from fixture metadata so the allowlist stays in sync
 * with the actual fixture set.
 */
const isFlaggersOnlyFixture = (fixture: LiveSeedFixtureDefinition): boolean => {
  const hasEvaluationSampling = (fixture.sampling.includeEvaluationIds ?? []).length > 0
  const hasLiveQueueSampling = fixture.sampling.liveQueueSample !== undefined
  return !hasEvaluationSampling && !hasLiveQueueSampling
}

const FLAGGERS_ONLY_FIXTURE_KEYS = new Set<string>(
  liveSeedFixtures.filter(isFlaggersOnlyFixture).map((fixture) => fixture.key),
)

export type LiveSeedSamplePreview = {
  readonly evaluationsById: Readonly<Record<string, boolean>>
  readonly liveQueue: boolean
  readonly flaggersBySlug: Readonly<Record<string, boolean>>
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
  readonly provisionFlaggers: boolean
  readonly countPerFixture: number
  readonly parallelCases: number
  readonly verboseSpans: boolean
  readonly seed?: string
  /**
   * Override target project slug. When set, the tool looks up the project by
   * slug in the Acme seed org and runs in flaggers-only mode (evaluations
   * + high-cost live queue are not required to exist in the target project).
   * Fixture selection is restricted to the flagger-triggering set.
   */
  readonly projectSlug?: string
  /**
   * Override API key token for ingest `Authorization` header. Defaults to the
   * seed token (`lat_seed_default_api_key_token`), which is Acme-scoped.
   */
  readonly apiKeyToken?: string
}

export type BuildLiveSeedRunPlanOptions = {
  readonly fixtureKeys?: readonly string[]
  readonly countPerFixture: number
  readonly timeScale: number
  readonly seed: string
  readonly targets: SeedTargets
  readonly ctx: SeedRunContext
}

export type DispatchResolvedCasesOptions = {
  readonly ingestBaseUrl: string
  readonly parallelCases: number
  readonly runId: string
  readonly verboseSpans?: boolean
  /**
   * Auth + project routing for `postSpanToIngest`. Optional because tests
   * bypass the real HTTP path via `postTraceSpan`; `sendLiveSeedData` always
   * fills this in with a resolved `SeedRunContext`.
   */
  readonly auth?: {
    readonly apiKeyToken: string
    readonly projectSlug: string
  }
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

function resolveSelectedFixtures(
  keys?: readonly string[],
  options?: { readonly flaggersOnly?: boolean },
): readonly LiveSeedFixtureDefinition[] {
  const available = options?.flaggersOnly
    ? liveSeedFixtures.filter((fixture) => FLAGGERS_ONLY_FIXTURE_KEYS.has(fixture.key))
    : liveSeedFixtures

  if (!keys || keys.length === 0) {
    return available
  }

  const fixturesByKey = new Map(available.map((fixture) => [fixture.key, fixture]))

  return keys.map((key) => {
    const fixture = fixturesByKey.get(key)
    if (!fixture) {
      if (options?.flaggersOnly && liveSeedFixtures.some((f) => f.key === key)) {
        throw new Error(
          `Fixture "${key}" requires seeded evaluations or live queues that aren't present in the override project. ` +
            `In flaggers-only mode, pick from: ${[...FLAGGERS_ONLY_FIXTURE_KEYS].sort().join(", ")}.`,
        )
      }
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

async function provisionFlaggers(ctx: SeedRunContext): Promise<void> {
  const client = createPostgresClient()

  try {
    const results = await Effect.runPromise(
      provisionFlaggersUseCase({
        organizationId: ctx.organizationId,
        projectId: ctx.projectId,
      }).pipe(withPostgres(FlaggerRepositoryLive, client, ctx.organizationId)),
    )

    console.log("[provision] Flaggers")
    for (const flagger of results) {
      console.log(`  - ${flagger.slug}: enabled=${flagger.enabled} sampling=${flagger.sampling}`)
    }
  } finally {
    await closePostgres(client.pool)
  }
}

/**
 * Resolve a `SeedRunContext` from CLI options. Defaults to the seed identity
 * (Acme org + Default Project + seed API key). When `projectSlug` is overridden
 * the project is looked up by slug (scoped to `SEED_ORG_ID`, the Acme seed org)
 * and `flaggersOnly` is turned on. Missing projects are created on the fly
 * so the CLI works against a fresh slug without requiring a UI round-trip.
 */
async function resolveRunContext(options: SendLiveSeedDataOptions): Promise<SeedRunContext> {
  const apiKeyToken = options.apiKeyToken ?? SEED_API_KEY_TOKEN

  if (!options.projectSlug || options.projectSlug === SEED_PROJECT_SLUG) {
    return {
      organizationId: SEED_ORG_ID,
      projectId: SEED_PROJECT_ID,
      projectSlug: SEED_PROJECT_SLUG,
      apiKeyToken,
      flaggersOnly: false,
    }
  }

  const targetSlug = options.projectSlug
  const client = createPostgresClient()

  try {
    const existing = await Effect.runPromise(
      Effect.gen(function* () {
        const repo = yield* ProjectRepository
        return yield* repo.findBySlug(targetSlug)
      }).pipe(withPostgres(ProjectRepositoryLive, client, SEED_ORG_ID)),
    ).catch((error: unknown) => {
      if (error instanceof Error && "_tag" in error && error._tag === "NotFoundError") {
        return null
      }
      throw error
    })

    const project =
      existing ??
      (await Effect.runPromise(
        Effect.gen(function* () {
          const repo = yield* ProjectRepository
          const created = createProject({
            organizationId: SEED_ORG_ID,
            name: targetSlug,
            slug: targetSlug,
          })
          yield* repo.save(created)
          console.log(`[live-seeds] Created project "${targetSlug}" in the Acme seed org`)
          return created
        }).pipe(withPostgres(ProjectRepositoryLive, client, SEED_ORG_ID)),
      ))

    return {
      organizationId: SEED_ORG_ID,
      projectId: project.id,
      projectSlug: project.slug,
      apiKeyToken,
      flaggersOnly: true,
    }
  } finally {
    await closePostgres(client.pool)
  }
}

async function loadSeedTargets(ctx: SeedRunContext): Promise<SeedTargets> {
  const client = createPostgresClient()

  try {
    const { evaluations, liveQueues, flaggers } = await Effect.runPromise(
      Effect.gen(function* () {
        const evaluationRepository = yield* EvaluationRepository
        const queueRepository = yield* AnnotationQueueRepository
        const flaggerRepository = yield* FlaggerRepository

        return {
          // Evaluations + live queues aren't required in fresh-project mode,
          // but loading them is cheap and lets us still print them in the
          // plan summary if they happen to exist.
          evaluations: yield* evaluationRepository.listByProjectId({
            projectId: ctx.projectId,
            options: {
              lifecycle: "active",
              limit: 100,
            },
          }),
          liveQueues: yield* queueRepository.listLiveQueuesByProject({
            projectId: ctx.projectId,
          }),
          flaggers: yield* flaggerRepository.listByProject({
            projectId: ctx.projectId,
          }),
        }
      }).pipe(
        withPostgres(
          Layer.mergeAll(EvaluationRepositoryLive, AnnotationQueueRepositoryLive, FlaggerRepositoryLive),
          client,
          ctx.organizationId,
        ),
      ),
    )

    const evaluationsById = Object.fromEntries(
      evaluations.items
        .filter((evaluation) => SEEDED_EVALUATION_ID_SET.has(evaluation.id))
        .map((evaluation) => [evaluation.id, evaluation]),
    )

    if (!ctx.flaggersOnly) {
      for (const evaluationId of SEEDED_EVALUATION_ORDER) {
        requireItem(
          evaluationsById[evaluationId],
          `Missing seeded active evaluation ${labelForEvaluation(evaluationId)} (${evaluationId})`,
        )
      }
    }

    const highCostLiveQueue = ctx.flaggersOnly
      ? liveQueues.find((queue) => queue.slug === HIGH_COST_LIVE_QUEUE_SLUG)
      : requireItem(
          liveQueues.find((queue) => queue.slug === HIGH_COST_LIVE_QUEUE_SLUG),
          `Missing live queue "${HIGH_COST_LIVE_QUEUE_SLUG}" in seeded project`,
        )

    requireItem(
      flaggers.find((flagger) => flagger.slug === FRUSTRATION_FLAGGER_SLUG),
      `Missing flagger "${FRUSTRATION_FLAGGER_SLUG}" in project "${ctx.projectSlug}" — did you forget to provision flaggers?`,
    )

    return {
      evaluationsById,
      highCostLiveQueue,
      flaggersBySlug: Object.fromEntries(flaggers.map((flagger) => [flagger.slug, flagger])),
    }
  } finally {
    await closePostgres(client.pool)
  }
}

async function sampleLiveEvaluation(ctx: SeedRunContext, target: Evaluation, traceId: string): Promise<boolean> {
  return deterministicSampling({
    sampling: target.trigger.sampling,
    keyParts: [ctx.organizationId, ctx.projectId, target.id, traceId],
  })
}

async function sampleLiveQueue(ctx: SeedRunContext, target: AnnotationQueue, traceId: string): Promise<boolean> {
  return deterministicSampling({
    sampling: target.settings.sampling ?? LIVE_QUEUE_DEFAULT_SAMPLING,
    keyParts: [ctx.organizationId, ctx.projectId, target.id, traceId],
  })
}

async function sampleFlagger(ctx: SeedRunContext, target: Flagger, traceId: string): Promise<boolean> {
  return deterministicSampling({
    sampling: target.sampling,
    keyParts: [ctx.organizationId, ctx.projectId, traceId, target.slug],
  })
}

async function computeSamplePreview(
  ctx: SeedRunContext,
  targets: SeedTargets,
  traceId: string,
): Promise<LiveSeedSamplePreview> {
  // In flaggers-only mode the target project isn't guaranteed to have
  // the seeded evaluations or high-cost live queue. Skip those branches
  // instead of crashing on `targets.evaluationsById[id]` / `highCostLiveQueue`.
  const evaluationsById = ctx.flaggersOnly
    ? {}
    : Object.fromEntries(
        await Promise.all(
          SEEDED_EVALUATION_ORDER.map(async (evaluationId) => {
            const evaluation = targets.evaluationsById[evaluationId]
            if (!evaluation) {
              throw new Error(`loadSeedTargets did not return evaluation ${evaluationId}`)
            }
            return [evaluationId, await sampleLiveEvaluation(ctx, evaluation, traceId)] as const
          }),
        ),
      )

  const liveQueue =
    ctx.flaggersOnly || !targets.highCostLiveQueue
      ? false
      : await sampleLiveQueue(ctx, targets.highCostLiveQueue, traceId)

  const flaggersBySlug = Object.fromEntries(
    await Promise.all(
      Object.entries(targets.flaggersBySlug).map(async ([slug, flagger]) => {
        return [slug, await sampleFlagger(ctx, flagger, traceId)] as const
      }),
    ),
  )

  return {
    evaluationsById,
    liveQueue,
    flaggersBySlug,
  }
}

function buildContextSamplingPlan(fixture: LiveSeedFixtureDefinition, targets: SeedTargets): SamplingPlan {
  const contextFlaggerSamples = Object.fromEntries(
    Object.keys(fixture.sampling.flaggerSamples ?? {})
      .filter((slug) => {
        const flagger = targets.flaggersBySlug[slug]
        return (flagger?.sampling ?? 0) < 100
      })
      .map((slug) => [slug, false]),
  )

  return {
    excludeEvaluationIds: SEEDED_EVALUATION_ORDER,
    liveQueueSample: false,
    ...(Object.keys(contextFlaggerSamples).length > 0 ? { flaggerSamples: contextFlaggerSamples } : {}),
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

  for (const [queueSlug, expectedSample] of Object.entries(plan.flaggerSamples ?? {})) {
    if (preview.flaggersBySlug[queueSlug] !== expectedSample) {
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
  readonly ctx: SeedRunContext
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
    const preview = await computeSamplePreview(input.ctx, input.targets, traceId)

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
  const fixtures = resolveSelectedFixtures(options.fixtureKeys, { flaggersOnly: options.ctx.flaggersOnly })
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
              ctx: options.ctx,
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

function formatFlaggerSamples(preview: LiveSeedSamplePreview, fixture: LiveSeedFixtureDefinition): string | undefined {
  const relevantQueueSlugs = Object.keys(fixture.sampling.flaggerSamples ?? {})
  if (relevantQueueSlugs.length === 0) {
    return undefined
  }

  return relevantQueueSlugs
    .map((queueSlug) => `${queueSlug}=${preview.flaggersBySlug[queueSlug] ? "in" : "out"}`)
    .join(", ")
}

function printFixturePlan(
  plan: LiveSeedRunPlan,
  ingestBaseUrl: string,
  provisioned: boolean,
  parallelCases: number,
  ctx: SeedRunContext,
) {
  const plannedTraceCount = getPlannedTraceCount(plan.cases)
  const plannedSpanCount = getPlannedSpanCount(plan.cases)

  console.log("[plan] Live-seed run")
  console.log(`  - ingest endpoint: ${normalizeBaseUrl(ingestBaseUrl)}/v1/traces`)
  console.log(`  - project slug: ${ctx.projectSlug}${ctx.flaggersOnly ? " (flaggers-only mode)" : ""}`)
  console.log(`  - flagger provisioning: ${provisioned ? "enabled" : "skipped"}`)
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
    const flaggerSamples = formatFlaggerSamples(targetTrace.samples, fixture)
    if (flaggerSamples) {
      console.log(`    flagger samples: ${flaggerSamples}`)
    }
    if (fixture.deterministicFlaggerMatches.length > 0) {
      console.log(`    deterministic flagger matches: ${fixture.deterministicFlaggerMatches.join(", ")}`)
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
  auth: { readonly apiKeyToken: string; readonly projectSlug: string },
): Promise<void> {
  const response = await fetch(`${normalizeBaseUrl(ingestBaseUrl)}/v1/traces`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${auth.apiKeyToken}`,
      "Content-Type": "application/json",
      "X-Latitude-Project": auth.projectSlug,
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
          if (!options.auth) {
            throw new Error(
              "dispatchResolvedCases requires `auth` (apiKeyToken + projectSlug) when `postTraceSpan` is not provided",
            )
          }
          await postSpanToIngest(options.ingestBaseUrl, scheduled.trace.traceId, scheduled.span.request, options.auth)
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
  const ctx = await resolveRunContext(options)

  if (options.provisionFlaggers) {
    await provisionFlaggers(ctx)
  }

  const targets = await loadSeedTargets(ctx)
  const plan = await buildLiveSeedRunPlan({
    ...(options.fixtureKeys ? { fixtureKeys: options.fixtureKeys } : {}),
    countPerFixture: options.countPerFixture,
    timeScale: options.timeScale,
    seed,
    targets,
    ctx,
  })

  printFixturePlan(plan, options.ingestBaseUrl, options.provisionFlaggers, options.parallelCases, ctx)

  const plannedTraceCount = getPlannedTraceCount(plan.cases)
  const plannedSpanCount = getPlannedSpanCount(plan.cases)
  console.log(
    `\n[send] Dispatching ${plan.cases.length.toString()} cases (${plannedTraceCount.toString()} traces, ${plannedSpanCount.toString()} spans planned) across ${resolveSelectedFixtures(options.fixtureKeys, { flaggersOnly: ctx.flaggersOnly }).length.toString()} fixtures...`,
  )
  const dispatchResult = await dispatchResolvedCases(plan.cases, {
    ingestBaseUrl: options.ingestBaseUrl,
    parallelCases: options.parallelCases,
    runId: plan.runId,
    verboseSpans: options.verboseSpans,
    auth: { apiKeyToken: ctx.apiKeyToken, projectSlug: ctx.projectSlug },
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
