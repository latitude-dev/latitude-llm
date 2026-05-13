/**
 * Project scoping — single-project default (existing pattern).
 *
 * `new Latitude({ apiKey, projectSlug })` sets a default project for every span. `capture()`
 * inherits it, so all spans land in the same Latitude project. This is the recommended setup
 * for processes that emit to one project.
 *
 * Required env vars:
 *   - LATITUDE_API_KEY
 *   - LATITUDE_PROJECT_SLUG
 *   - OPENAI_API_KEY
 *
 * Install:  npm install openai
 * Run from `packages/telemetry/typescript/`:
 *   npx tsx --env-file=examples/.env examples/test_project_scoping_single.ts
 */

import OpenAI from "openai"
import { capture, Latitude } from "../src"

const latitude = new Latitude({
  apiKey: process.env.LATITUDE_API_KEY!,
  projectSlug: process.env.LATITUDE_PROJECT_SLUG!,
  disableBatch: true,
  instrumentations: ["openai"],
})

async function main() {
  await latitude.ready
  const client = new OpenAI()

  // Both captures inherit the ctor `projectSlug` (sent as the `X-Latitude-Project` header).
  // The OpenAI spans land in the default project alongside the capture root span.
  await capture("greet", async () => {
    const r = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: "Say 'Hello!' in exactly 2 words." }],
      max_tokens: 20,
    })
    console.log("greet →", r.choices[0]?.message?.content)
  })

  await capture(
    "summarize",
    async () => {
      const r = await client.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: "Summarize 'OpenAI is fun' in 3 words." }],
        max_tokens: 20,
      })
      console.log("summarize →", r.choices[0]?.message?.content)
    },
    { tags: ["demo"] },
  )

  await latitude.flush()
}

void main().catch((err) => {
  console.error(err)
  process.exit(1)
})
