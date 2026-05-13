/**
 * Project scoping — env-driven default + per-capture override.
 *
 * Reads the default project slug from `LATITUDE_PROJECT_SLUG` and lets specific captures
 * override it via `capture({ projectSlug })`. A common shape for services that run in many
 * environments (staging/prod each have their own project slug) but still need to route a
 * subset of spans elsewhere.
 *
 * Resolution precedence (highest → lowest):
 *   1. `capture({ projectSlug })`           — emits `latitude.project` on the span
 *   2. OTEL resource attribute `latitude.project`  — bare-OTEL setups
 *   3. ctor `projectSlug`                   — sent as `X-Latitude-Project` header
 *
 * The override slug (`evaluation-runs` below) must exist in the same org as `LATITUDE_API_KEY`.
 *
 * Required env vars:
 *   - LATITUDE_API_KEY
 *   - LATITUDE_PROJECT_SLUG  (env-driven default for the ctor)
 *   - OPENAI_API_KEY
 *
 * Install:  npm install openai
 * Run from `packages/telemetry/typescript/`:
 *   npx tsx --env-file=examples/.env examples/test_project_scoping_env.ts
 */

import OpenAI from "openai"
import { capture, Latitude } from "../src"

const DEFAULT_SLUG = process.env.LATITUDE_PROJECT_SLUG!
const latitude = new Latitude({
  apiKey: process.env.LATITUDE_API_KEY!,
  projectSlug: DEFAULT_SLUG,
  disableBatch: true,
  instrumentations: ["openai"],
})

const OVERRIDE_SLUG = "evaluation-runs"

async function main() {
  await latitude.ready
  const client = new OpenAI()

  // Inherits the env-driven default — lands in `LATITUDE_PROJECT_SLUG`.
  await capture("default-route", async () => {
    const r = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: `Reply with '${DEFAULT_SLUG}' in one word.` }],
      max_tokens: 10,
    })
    console.log("default-route →", r.choices[0]?.message?.content)
  })

  // Per-capture override beats the ctor default. Routes to `evaluation-runs` regardless of env.
  await capture(
    "evaluation-batch",
    async () => {
      const r = await client.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: "Reply with 'override' in one word." }],
        max_tokens: 10,
      })
      console.log(`${OVERRIDE_SLUG} →`, r.choices[0]?.message?.content)
    },
    { projectSlug: OVERRIDE_SLUG },
  )

  await latitude.flush()
}

void main().catch((err) => {
  console.error(err)
  process.exit(1)
})
