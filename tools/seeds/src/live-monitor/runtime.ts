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
import { type LiveMonitorFixtureDefinition, liveMonitorFixtureKeys, liveMonitorFixtures } from "./fixtures.ts"
import { type BuiltTraceSpan, buildTraceRequests } from "./otlp.ts"

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

type SeedTargets = {
  readonly evaluationsById: Readonly<Record<string, Evaluation>>
  readonly highCostLiveQueue: AnnotationQueue
  readonly systemQueuesBySlug: Readonly<Record<string, AnnotationQueue>>
}

type ResolvedFixture = {
  readonly fixture: LiveMonitorFixtureDefinition
  readonly traceId: string
  readonly sessionId: string
  readonly userId: string
  readonly startDelayMs: number
  readonly spans: readonly BuiltTraceSpan[]
  readonly samples: {
    readonly evaluations: Readonly<Record<string, boolean>>
    readonly liveQueue?: boolean
    readonly systemQueues?: Readonly<Record<string, boolean>>
  }
}

export type SendLiveMonitorSeedDataOptions = {
  readonly fixtureKeys?: readonly string[]
  readonly ingestBaseUrl: string
  readonly timeScale: number
  readonly provisionSystemQueues: boolean
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

function labelForEvaluation(evaluationId: string): string {
  const label = EVALUATION_LABELS[evaluationId]
  if (!label) {
    throw new Error(`Missing evaluation label for ${evaluationId}`)
  }
  return label
}

function resolveSelectedFixtures(keys?: readonly string[]): readonly LiveMonitorFixtureDefinition[] {
  if (!keys || keys.length === 0) {
    return liveMonitorFixtures
  }

  const fixturesByKey = new Map(liveMonitorFixtures.map((fixture) => [fixture.key, fixture]))

  return keys.map((key) => {
    const fixture = fixturesByKey.get(key)
    if (!fixture) {
      throw new Error(`Unknown fixture "${key}". Valid fixtures: ${[...liveMonitorFixtureKeys].sort().join(", ")}`)
    }
    return fixture
  })
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

    console.log("Provisioned system queues:")
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
  fixture: LiveMonitorFixtureDefinition,
  targets: SeedTargets,
  traceId: string,
): Promise<ResolvedFixture["samples"]> {
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

function samplePreviewMatchesRequirements(
  fixture: LiveMonitorFixtureDefinition,
  preview: ResolvedFixture["samples"],
): boolean {
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

async function findTraceIdForFixture(
  fixture: LiveMonitorFixtureDefinition,
  targets: SeedTargets,
  runId: string,
): Promise<{ readonly traceId: string; readonly preview: ResolvedFixture["samples"] }> {
  for (let attempt = 0; attempt < MAX_TRACE_ID_SEARCH_ATTEMPTS; attempt += 1) {
    const traceId = hashHex(`seed-live-monitor:${runId}:${fixture.key}:${attempt.toString()}`, 32)
    const preview = await computeSamplePreview(fixture, targets, traceId)

    if (samplePreviewMatchesRequirements(fixture, preview)) {
      return { traceId, preview }
    }
  }

  throw new Error(
    `Unable to find a traceId for fixture "${fixture.key}" after ${MAX_TRACE_ID_SEARCH_ATTEMPTS.toString()} attempts`,
  )
}

function scaleMs(value: number, timeScale: number, minimumMs = 0): number {
  return Math.max(minimumMs, Math.round(value * timeScale))
}

async function resolveFixtures(
  fixtures: readonly LiveMonitorFixtureDefinition[],
  targets: SeedTargets,
  runId: string,
  timeScale: number,
): Promise<readonly ResolvedFixture[]> {
  const scriptBaseTime = Date.now() + 1_500

  return Promise.all(
    fixtures.map(async (fixture) => {
      const { traceId, preview } = await findTraceIdForFixture(fixture, targets, runId)
      const sessionId = `seed-live-monitor:${runId}:${fixture.key}`
      const userId = `seed-user:${fixture.key}`
      const startDelayMs = scaleMs(fixture.startDelayMs, timeScale)
      const baseTime = new Date(scriptBaseTime + startDelayMs)
      const scaledSpans = fixture.spans.map((span) => ({
        ...span,
        offsetMs: scaleMs(span.offsetMs, timeScale),
        durationMs: scaleMs(span.durationMs, timeScale, 250),
      }))

      return {
        fixture,
        traceId,
        sessionId,
        userId,
        startDelayMs,
        spans: buildTraceRequests({
          traceId,
          sessionId,
          userId,
          serviceName: fixture.serviceName,
          spans: scaledSpans,
          systemInstructions: fixture.systemInstructions,
          tags: fixture.tags,
          metadata: {
            ...fixture.metadata,
            runId,
          },
          baseTime,
        }),
        samples: preview,
      } satisfies ResolvedFixture
    }),
  )
}

function printFixturePlan(fixtures: readonly ResolvedFixture[], ingestBaseUrl: string, provisioned: boolean) {
  console.log("Live-monitor seed run plan:")
  console.log(`  - ingest endpoint: ${normalizeBaseUrl(ingestBaseUrl)}/v1/traces`)
  console.log(`  - project slug: ${SEED_PROJECT_SLUG}`)
  console.log(`  - system queue provisioning: ${provisioned ? "enabled" : "skipped"}`)
  console.log(`  - trace-end debounce: ${Math.ceil(TRACE_END_DEBOUNCE_MS / 1000).toString()}s`)

  for (const resolved of fixtures) {
    console.log(`\n  - ${resolved.fixture.key}`)
    console.log(`    traceId: ${resolved.traceId}`)
    console.log(`    service: ${resolved.fixture.serviceName}`)
    console.log(
      `    live evaluations: ${Object.entries(resolved.samples.evaluations)
        .map(([label, sampled]) => `${label}=${sampled ? "in" : "out"}`)
        .join(", ")}`,
    )
    if (resolved.samples.liveQueue !== undefined) {
      console.log(`    high-cost live queue sample: ${resolved.samples.liveQueue ? "in" : "out"}`)
    }
    if (resolved.samples.systemQueues !== undefined) {
      console.log(
        `    system queue samples: ${Object.entries(resolved.samples.systemQueues)
          .map(([queueSlug, sampled]) => `${queueSlug}=${sampled ? "in" : "out"}`)
          .join(", ")}`,
      )
    }
    if (resolved.fixture.deterministicSystemMatches.length > 0) {
      console.log(`    deterministic system matches: ${resolved.fixture.deterministicSystemMatches.join(", ")}`)
    }
    if (resolved.fixture.llmSystemIntents.length > 0) {
      console.log(`    LLM system intents: ${resolved.fixture.llmSystemIntents.join(", ")}`)
    }
  }
}

async function postSpan(ingestBaseUrl: string, traceId: string, request: BuiltTraceSpan["request"]): Promise<void> {
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

async function dispatchFixtures(fixtures: readonly ResolvedFixture[], ingestBaseUrl: string): Promise<void> {
  const runStartedAt = Date.now()

  await Promise.all(
    fixtures.flatMap((resolved) =>
      resolved.spans.map(async (span) => {
        const dueAt = runStartedAt + resolved.startDelayMs + span.offsetMs
        const sleepFor = Math.max(0, dueAt - Date.now())

        if (sleepFor > 0) {
          await sleep(sleepFor)
        }

        await postSpan(ingestBaseUrl, resolved.traceId, span.request)
        console.log(
          `[${new Date().toISOString()}] sent ${resolved.fixture.key}/${span.label} trace=${resolved.traceId} span=${span.spanId}`,
        )
      }),
    ),
  )
}

export function printFixtureCatalog(): void {
  console.log("Available live-monitor fixtures:")
  for (const fixture of liveMonitorFixtures) {
    console.log(`  - ${fixture.key}: ${fixture.description}`)
  }
}

export async function sendLiveMonitorSeedData(options: SendLiveMonitorSeedDataOptions): Promise<void> {
  const selectedFixtures = resolveSelectedFixtures(options.fixtureKeys)
  const runId = randomUUID().replaceAll("-", "").slice(0, 8)

  if (options.provisionSystemQueues) {
    await provisionSystemQueues()
  }

  const targets = await loadSeedTargets()
  const resolvedFixtures = await resolveFixtures(selectedFixtures, targets, runId, options.timeScale)
  printFixturePlan(resolvedFixtures, options.ingestBaseUrl, options.provisionSystemQueues)

  console.log(`\nSending ${resolvedFixtures.length.toString()} traces with runId=${runId}...`)
  await dispatchFixtures(resolvedFixtures, options.ingestBaseUrl)

  const maxDispatchMs = resolvedFixtures.reduce((fixtureMax, resolved) => {
    const spanMax = resolved.spans.reduce((spanLimit, span) => Math.max(spanLimit, span.offsetMs), 0)
    return Math.max(fixtureMax, resolved.startDelayMs + spanMax)
  }, 0)

  console.log("\nAll spans were sent successfully.")
  console.log(
    `Allow at least ${Math.ceil((TRACE_END_DEBOUNCE_MS + maxDispatchMs) / 1000).toString()}s from script start for every trace to become eligible for TraceEnded on this branch.`,
  )
  console.log(`Use runId=${runId} to correlate the ingested traces and downstream worker logs.`)
}
