/**
 * Project scoping — multi-project per-capture override.
 *
 * `new Latitude({ apiKey })` is initialized *without* a default `projectSlug`. Every `capture()`
 * must declare its own `projectSlug` and spans are routed per-capture via the
 * `latitude.project` span attribute. Use this when a single process emits to several Latitude
 * projects (e.g. multiple agents sharing one runtime).
 *
 * Both projects must exist in the org behind `LATITUDE_API_KEY`. The slugs below default to
 * `primary` / `secondary` to match what `pnpm --filter @tools/live-seeds seed:multi-project-demo`
 * provisions — run that once first and this example works without any UI clicks. Or override
 * via `LATITUDE_PRIMARY_PROJECT_SLUG` / `LATITUDE_SECONDARY_PROJECT_SLUG` to target your own.
 *
 * Required env vars:
 *   - LATITUDE_API_KEY
 *   - OPENAI_API_KEY
 *
 * Optional env vars:
 *   - LATITUDE_PRIMARY_PROJECT_SLUG    (defaults to "primary")
 *   - LATITUDE_SECONDARY_PROJECT_SLUG  (defaults to "secondary")
 *
 * Install:  npm install openai
 * Run from `packages/telemetry/typescript/`:
 *   npx tsx --env-file=examples/.env examples/test_project_scoping_multi.ts
 */

import OpenAI from "openai"
import { capture, Latitude } from "../src"

const latitude = new Latitude({
  apiKey: process.env.LATITUDE_API_KEY!,
  disableBatch: true,
  instrumentations: ["openai"],
})

const FULL_STACK_AGENT_SLUG = "primary"
const CALL_SUMMARISER_SLUG = "secondary"

async function main() {
  await latitude.ready
  const client = new OpenAI()

  await capture(
    "full-stack-agent-run",
    async () => {
      const r = await client.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: "Ship feature X — what's step 1? Reply in 5 words." }],
        max_tokens: 30,
      })
      console.log(`${FULL_STACK_AGENT_SLUG} →`, r.choices[0]?.message?.content)
    },
    { projectSlug: FULL_STACK_AGENT_SLUG, tags: ["agent:full-stack"] },
  )

  await capture(
    "call-summariser-run",
    async () => {
      const r = await client.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: "Summarize: 'Customer asked for refund.' in 4 words." }],
        max_tokens: 30,
      })
      console.log(`${CALL_SUMMARISER_SLUG} →`, r.choices[0]?.message?.content)
    },
    { projectSlug: CALL_SUMMARISER_SLUG, tags: ["agent:summariser"] },
  )

  // Spans with no `projectSlug` AND no ctor default are rejected by the ingest service with
  // a `partial_success` body — exporters log the rejection but don't retry. Always set a slug
  // either on the ctor or on each `capture()` when running this pattern.

  await latitude.flush()
}

void main().catch((err) => {
  console.error(err)
  process.exit(1)
})
