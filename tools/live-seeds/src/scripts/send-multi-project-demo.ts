/**
 * Multi-project ingest smoke test.
 *
 * Sends one OTLP batch that mixes spans across two projects (`primary`, `secondary`) and one
 * unscoped span, then a second batch with only unscoped spans. Used to verify the per-span
 * project resolution chain and the OTLP `partial_success` response shape end-to-end against a
 * locally-running ingest service.
 *
 * Default flow:
 *   1. Resolves the seeded org (Acme) and ensures the `primary` and `secondary` projects exist.
 *   2. POSTs one batch with three spans:
 *        - span A: `latitude.project = primary`
 *        - span B: `latitude.project = secondary`
 *        - span C: no `latitude.project` (falls back to `X-Latitude-Project: primary`)
 *      Expected: 200 OK with no `partialSuccess`.
 *   3. POSTs a second batch with one span carrying an unknown slug AND no header default.
 *      Expected: 400 with a `google.rpc.Status`-shaped body `{ code, message }`.
 *
 * Run with `pnpm --filter @tools/live-seeds exec tsx src/scripts/send-multi-project-demo.ts`.
 */

import { randomBytes } from "node:crypto"
import { existsSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { parseArgs } from "node:util"
import { createProjectUseCase, ProjectRepository } from "@domain/projects"
import { SEED_API_KEY_TOKEN, SEED_ORG_ID } from "@domain/shared/seeding"
import {
  closePostgres,
  createPostgresClient,
  OutboxEventWriterLive,
  ProjectRepositoryLive,
  withPostgres,
} from "@platform/db-postgres"
import { parseEnv } from "@platform/env"
import { Effect, Layer } from "effect"

function loadEnv(importMetaUrl: string): void {
  const nodeEnv = process.env.NODE_ENV ?? "development"
  const envPath = fileURLToPath(new URL(`../../../../.env.${nodeEnv}`, importMetaUrl))
  if (existsSync(envPath)) process.loadEnvFile(envPath)
}

function resolveIngestBaseUrl(): string {
  const port = Effect.runSync(parseEnv("LAT_INGEST_PORT", "number", 3002))
  return `http://127.0.0.1:${port.toString()}`
}

const PRIMARY_SLUG = "primary"
const SECONDARY_SLUG = "secondary"

async function ensureProjects(): Promise<void> {
  const client = createPostgresClient()
  try {
    for (const slug of [PRIMARY_SLUG, SECONDARY_SLUG]) {
      const existing = await Effect.runPromise(
        Effect.gen(function* () {
          const repo = yield* ProjectRepository
          return yield* repo.findBySlug(slug)
        }).pipe(withPostgres(ProjectRepositoryLive, client, SEED_ORG_ID)),
      ).catch((error: unknown) => {
        if (error instanceof Error && "_tag" in error && error._tag === "NotFoundError") {
          return null
        }
        throw error
      })

      if (existing) continue

      // Go through the use case (not `repo.save` directly) so the ProjectCreated
      // outbox event is written. That triggers the projects:provision queue and
      // flagger auto-provisioning, matching the path taken by real user-created
      // projects.
      const created = await Effect.runPromise(
        createProjectUseCase({ name: slug }).pipe(
          withPostgres(Layer.mergeAll(ProjectRepositoryLive, OutboxEventWriterLive), client, SEED_ORG_ID),
        ),
      )
      if (created.slug !== slug) {
        throw new Error(`[live-seeds] expected slug "${slug}" but use case derived "${created.slug}"`)
      }
      console.log(`[live-seeds] Created project "${slug}" in the Acme seed org`)
    }
  } finally {
    await closePostgres(client.pool)
  }
}

const hexId = (bytes: number) => randomBytes(bytes).toString("hex")

// Unique trace per script run so reruns don't dedupe in ClickHouse and each Batch shows up as
// its own trace in the UI.
const RUN_TRACE_ID = hexId(16) // 32-char OTLP trace id

function nowNanos(offsetMs = 0): string {
  return (BigInt(Date.now() + offsetMs) * 1_000_000n).toString()
}

type OtlpAttr = { key: string; value: { stringValue: string } } | { key: string; value: { intValue: string } }

/**
 * Builds a realistic OTel GenAI "chat" span — model, provider, input/output messages, token
 * usage — so the UI shows the routed traces with full content. Matches the attribute keys the
 * server-side transform reads (`gen_ai.*`).
 */
function buildSpan(
  name: string,
  options: {
    projectSlug?: string
    userPrompt: string
    assistantReply: string
    tags: readonly string[]
  },
) {
  const { projectSlug, userPrompt, assistantReply, tags } = options
  const attributes: OtlpAttr[] = [
    { key: "gen_ai.operation.name", value: { stringValue: "chat" } },
    { key: "gen_ai.provider.name", value: { stringValue: "openai" } },
    { key: "gen_ai.request.model", value: { stringValue: "gpt-4o-mini" } },
    { key: "gen_ai.response.model", value: { stringValue: "gpt-4o-mini-2026-01-01" } },
    { key: "gen_ai.response.id", value: { stringValue: `chatcmpl-${hexId(6)}` } },
    { key: "gen_ai.usage.input_tokens", value: { intValue: String(20 + userPrompt.length) } },
    { key: "gen_ai.usage.output_tokens", value: { intValue: String(10 + assistantReply.length) } },
    {
      key: "gen_ai.input.messages",
      value: {
        stringValue: JSON.stringify([{ role: "user", parts: [{ type: "text", content: userPrompt }] }]),
      },
    },
    {
      key: "gen_ai.output.messages",
      value: {
        stringValue: JSON.stringify([{ role: "assistant", parts: [{ type: "text", content: assistantReply }] }]),
      },
    },
    // Latitude tags travel as a JSON-stringified array under `latitude.tags`.
    { key: "latitude.tags", value: { stringValue: JSON.stringify(tags) } },
  ]
  if (projectSlug) attributes.push({ key: "latitude.project", value: { stringValue: projectSlug } })

  return {
    traceId: RUN_TRACE_ID,
    spanId: hexId(8), // 16-char OTLP span id
    name,
    kind: 3, // CLIENT — matches OTel convention for outbound LLM calls
    startTimeUnixNano: nowNanos(),
    endTimeUnixNano: nowNanos(250),
    attributes,
    status: { code: 1 },
  }
}

function buildBatch(spans: ReturnType<typeof buildSpan>[]) {
  return {
    resourceSpans: [
      {
        resource: { attributes: [{ key: "service.name", value: { stringValue: "live-seeds" } }] },
        scopeSpans: [{ scope: { name: "multi-project-demo", version: "1.0.0" }, spans }],
      },
    ],
  }
}

async function postBatch(
  ingestBaseUrl: string,
  apiKey: string,
  body: object,
  options: { readonly defaultProjectSlug?: string } = {},
): Promise<{ status: number; body: string }> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  }
  if (options.defaultProjectSlug) headers["X-Latitude-Project"] = options.defaultProjectSlug

  const response = await fetch(`${ingestBaseUrl.replace(/\/$/, "")}/v1/traces`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  })
  const text = await response.text()
  return { status: response.status, body: text }
}

async function main(): Promise<void> {
  loadEnv(import.meta.url)

  const { values } = parseArgs({
    options: {
      "ingest-url": { type: "string" },
      "api-key-token": { type: "string" },
      help: { type: "boolean", default: false },
    },
  })

  if (values.help) {
    console.log(`
Usage: pnpm --filter @tools/live-seeds exec tsx src/scripts/send-multi-project-demo.ts [options]

Options:
  --ingest-url <url>     Base URL for the ingest service (default: LAT_INGEST_PORT)
  --api-key-token <tok>  Ingest API key (default: seed token)
  --help                 Show this help
`)
    process.exit(0)
  }

  const ingestBaseUrl = values["ingest-url"] ?? resolveIngestBaseUrl()
  const apiKey = values["api-key-token"] ?? SEED_API_KEY_TOKEN

  console.log("[live-seeds] Ensuring `primary` and `secondary` projects exist in the seed org...")
  await ensureProjects()

  console.log("\n[live-seeds] Batch 1 — mixed (primary span + secondary span + header-default span)")
  const mixedBatch = buildBatch([
    buildSpan("chat gpt-4o-mini", {
      projectSlug: PRIMARY_SLUG,
      tags: ["batch-1", "primary"],
      userPrompt: "Summarize the day's standup notes in 2 sentences.",
      assistantReply: "Team shipped the new ingest path and unblocked Carlos on the Realtie agent.",
    }),
    buildSpan("chat gpt-4o-mini", {
      projectSlug: SECONDARY_SLUG,
      tags: ["batch-1", "secondary"],
      userPrompt: "Transcribe the customer call snippet attached.",
      assistantReply: "Customer asked about pricing for the enterprise plan; said they'd email next week.",
    }),
    buildSpan("chat gpt-4o-mini", {
      tags: ["batch-1", "header-default"],
      userPrompt: "What's the weather like in Barcelona today?",
      assistantReply: "Sunny, around 22°C — typical late-spring weather.",
    }),
  ])
  const r1 = await postBatch(ingestBaseUrl, apiKey, mixedBatch, { defaultProjectSlug: PRIMARY_SLUG })
  console.log(`  HTTP ${r1.status}\n  ${r1.body}`)
  if (r1.status !== 200) {
    console.error("Expected 200 for the mixed-but-all-resolvable batch")
    process.exitCode = 1
  }

  console.log("\n[live-seeds] Batch 2 — all spans rejected (unknown slug + no header, expect 400 + Status body)")
  const rejectedBatch = buildBatch([
    buildSpan("chat gpt-4o-mini", {
      projectSlug: "no-such-project-slug",
      tags: ["batch-2", "should-not-appear"],
      userPrompt: "This span should never land — its slug doesn't exist in the org.",
      assistantReply: "(should be rejected by ingest)",
    }),
  ])
  const r2 = await postBatch(ingestBaseUrl, apiKey, rejectedBatch)
  console.log(`  HTTP ${r2.status}\n  ${r2.body}`)
  if (r2.status !== 400) {
    console.error("Expected 400 for the all-rejected batch (unknown slug + no header)")
    process.exitCode = 1
  }

  console.log("\n[live-seeds] Batch 3 — partial_success (one valid + one wrong-org slug)")
  const partialBatch = buildBatch([
    buildSpan("chat gpt-4o-mini", {
      projectSlug: PRIMARY_SLUG,
      tags: ["batch-3", "primary"],
      userPrompt: "Draft a follow-up email to the customer.",
      assistantReply: "Hi Alex, thanks for the chat — sharing the enterprise pricing breakdown below…",
    }),
    buildSpan("chat gpt-4o-mini", {
      projectSlug: "no-such-project-slug",
      tags: ["batch-3", "should-not-appear"],
      userPrompt: "This one should be rejected (wrong-org slug).",
      assistantReply: "(should be counted in partialSuccess.rejectedSpans)",
    }),
  ])
  const r3 = await postBatch(ingestBaseUrl, apiKey, partialBatch)
  console.log(`  HTTP ${r3.status}\n  ${r3.body}`)
  if (r3.status !== 200 || !r3.body.includes("partialSuccess")) {
    console.error("Expected 200 with partialSuccess for the mixed-rejection batch")
    process.exitCode = 1
  }

  console.log(`
[live-seeds] What to expect in the Latitude UI (trace id = ${RUN_TRACE_ID}):

  primary    → 1 trace, 3 spans
                 - Batch 1 "Summarize standup notes"           (tags: batch-1, primary)
                 - Batch 1 "Weather in Barcelona"              (tags: batch-1, header-default)  ← routed via X-Latitude-Project header
                 - Batch 3 "Draft follow-up email"             (tags: batch-3, primary)

  secondary  → 1 trace, 1 span
                 - Batch 1 "Transcribe customer call snippet"  (tags: batch-1, secondary)

  Rejected (not persisted anywhere — visible only in the HTTP responses above):
    - Batch 2 span (unknown slug + no header)  → 400 Status body
    - Batch 3 span (wrong-org slug)            → counted in partialSuccess.rejectedSpans

Total: 4 spans persisted across 2 traces (1 per project, sharing the same trace id), 2 rejected.
Filter by tag \`batch-1\`, \`batch-2\`, or \`batch-3\` to isolate the batches in the UI.
`)
}

void main().catch((error: unknown) => {
  console.error("Failed to run multi-project demo:")
  console.error(error)
  process.exitCode = 1
})
