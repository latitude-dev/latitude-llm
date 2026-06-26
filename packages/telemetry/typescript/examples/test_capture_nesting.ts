/**
 * Nested capture() context merging — Latitude telemetry example.
 *
 * Verifies that nested capture() calls correctly merge context onto the spans
 * created within each nesting level:
 * - tags: merge and deduplicate
 * - metadata: shallow merge (child overrides parent for same keys)
 * - sessionId/userId: last-write-wins (innermost capture wins)
 *
 * Nested captures reuse the active trace/root span and only MERGE context — they
 * don't create a span per level — so each LLM span reflects the merged context
 * of the capture it ran inside.
 *
 * Required env vars:
 * - LATITUDE_API_KEY
 * - LATITUDE_PROJECT_SLUG
 * - OPENAI_API_KEY
 *
 * Install: npm install openai
 */

import { randomUUID } from "node:crypto"
import OpenAI from "openai"
import { capture, Latitude } from "../src"

const latitude = new Latitude({
  apiKey: process.env.LATITUDE_API_KEY!,
  project: process.env.LATITUDE_PROJECT_SLUG!,
  instrumentations: { openai: OpenAI },
  disableBatch: true,
})

const openai = new OpenAI()

const MODEL = "gpt-5.5"
// gpt-5.5 is a reasoning model: budget must cover reasoning + the visible answer (else finish_reason "length").
const MAX_TOKENS = 2000
const SYSTEM = "You are a helpful assistant participating in a telemetry QA test. Keep answers concise."
// Shared run id so the whole run is findable via a single tag, while the per-capture
// sessionId/userId/metadata stay as the merge-semantics fixture they exist to test.
const RUN = `capture-nesting-${randomUUID().slice(0, 8)}`

async function say(prompt: string) {
  const response = await openai.chat.completions.create({
    model: MODEL,
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: prompt },
    ],
    max_completion_tokens: MAX_TOKENS,
  })
  return response.choices[0]?.message?.content
}

async function toolConversation() {
  const tools = [
    {
      type: "function" as const,
      function: {
        name: "get_weather",
        description: "Get the current weather for a city",
        parameters: {
          type: "object",
          properties: { city: { type: "string" } },
          required: ["city"],
        },
      },
    },
  ]
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM },
    { role: "user", content: "What's the weather in San Francisco? Use get_weather, then answer in one short sentence." },
  ]

  const first = await openai.chat.completions.create({ model: MODEL, messages, tools, max_completion_tokens: MAX_TOKENS })
  const toolCall = first.choices[0]?.message?.tool_calls?.[0]
  messages.push(first.choices[0]!.message)
  messages.push({
    role: "tool",
    tool_call_id: toolCall!.id,
    content: JSON.stringify({ city: "San Francisco", temperatureC: 21, conditions: "sunny" }),
  })

  const second = await openai.chat.completions.create({ model: MODEL, messages, tools, max_completion_tokens: MAX_TOKENS })
  return second.choices[0]?.message?.content
}

async function decoratorStyleNesting() {
  // Outer capture; the first LLM span carries the outer context verbatim.
  return capture(
    "outer-capture",
    async () => {
      const outerResponse = await say("Say 'First call' in exactly 2 words.")

      // Inner capture runs the tool conversation so we verify the MERGED context
      // (tags deduped, sessionId/userId overridden, metadata shallow-merged)
      // lands on the tool-conversation spans.
      const innerResponse = await capture("inner-capture", toolConversation, {
        tags: ["inner-tag", "shared-tag", RUN, "capture-nesting-ts"], // shared-tag deduped
        sessionId: "inner-session", // overrides outer-session
        userId: "inner-user", // overrides outer-user
        metadata: { inner_key: "inner_value", shared_key: "inner_shared" }, // shared_key overridden
      })

      return { outerResponse, innerResponse }
    },
    {
      tags: ["outer-tag", "shared-tag", RUN, "capture-nesting-ts"],
      sessionId: "outer-session",
      userId: "outer-user",
      metadata: { outer_key: "outer_value", shared_key: "outer_shared" },
    },
  )
}

async function deeplyNested() {
  return capture(
    "level-1",
    async () => {
      const nested = await capture(
        "level-2",
        async () => {
          const level3Result = await capture("level-3", () => say("Say 'Level 3' in exactly 2 words."), {
            tags: ["level-3-tag", RUN, "capture-nesting-ts"],
            sessionId: "level-3-session",
            userId: "level-3-user",
            metadata: { level: 3, shared: "level-3" },
          })
          const level2Result = await say("Say 'Level 2' in exactly 2 words.")
          return { level3Result, level2Result }
        },
        {
          tags: ["level-2-tag", RUN, "capture-nesting-ts"],
          sessionId: "level-2-session",
          userId: "level-2-user",
          metadata: { level: 2, shared: "level-2" },
        },
      )
      const level1Result = await say("Say 'Level 1' in exactly 2 words.")
      return { nested, level1Result }
    },
    {
      tags: ["level-1-tag", RUN, "capture-nesting-ts"],
      sessionId: "level-1-session",
      userId: "level-1-user",
      metadata: { level: 1, shared: "level-1" },
    },
  )
}

async function main() {
  await latitude.ready

  console.log(`Run tag: ${RUN}`)

  console.log("\n1. Testing nested captures (outer → inner tool conversation)...")
  console.log("Result:", await decoratorStyleNesting())

  console.log("\n2. Testing deeply nested captures (3 levels)...")
  console.log("Result:", await deeplyNested())

  await latitude.flush()
  await latitude.shutdown()

  console.log("\nExpected merge on the inner-capture (tool-conversation) spans:")
  console.log("- tags = [outer-tag, shared-tag, inner-tag] (deduplicated) + run/lang tags")
  console.log("- sessionId = inner-session, userId = inner-user (overridden)")
  console.log("- metadata.shared_key = inner_shared (overridden); outer_key + inner_key both present")
}

main().catch(console.error)
