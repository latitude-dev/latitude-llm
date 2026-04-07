/**
 * Test nested capture() context merging.
 *
 * This verifies that nested capture() calls correctly merge context:
 * - tags: merge and deduplicate
 * - metadata: shallow merge (child overrides parent for same keys)
 * - sessionId/userId: last-write-wins
 *
 * Required env vars:
 * - LATITUDE_API_KEY
 * - LATITUDE_PROJECT_SLUG
 * - OPENAI_API_KEY
 *
 * Install: npm install openai
 */

import { capture, initLatitude } from "../src"
import OpenAI from "openai"

// Initialize telemetry
const latitude = initLatitude({
  apiKey: process.env.LATITUDE_API_KEY!,
  projectSlug: process.env.LATITUDE_PROJECT_SLUG!,
  instrumentations: ["openai"],
  disableBatch: true,
})

const openai = new OpenAI()

// Outer capture with initial context
const outerFunction = capture(
  {
    name: "outer-capture",
    tags: ["outer-tag", "shared-tag"],
    sessionId: "outer-session",
    userId: "outer-user",
    metadata: { outer_key: "outer_value", shared_key: "outer_shared" },
  },
  async () => {
    // First LLM call in outer context
    const response1 = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: "Say 'First call' in exactly 2 words." }],
      max_tokens: 50,
    })

    // Call inner function with nested capture
    const innerResult = await innerFunction()

    // Second LLM call (should still have outer context)
    const response2 = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: "Say 'Second call' in exactly 2 words." }],
      max_tokens: 50,
    })

    return {
      outerResponse: response1.choices[0].message.content,
      innerResponse: innerResult,
      secondOuterResponse: response2.choices[0].message.content,
    }
  },
)

// Inner capture with context that should merge with outer
const innerFunction = capture(
  {
    name: "inner-capture",
    tags: ["inner-tag", "shared-tag"], // shared-tag should be deduplicated
    sessionId: "inner-session", // should override outer-session
    userId: "inner-user", // should override outer-user
    metadata: { inner_key: "inner_value", shared_key: "inner_shared" }, // shared_key should be overridden
  },
  async () => {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: "Say 'Inner call' in exactly 2 words." }],
      max_tokens: 50,
    })

    return response.choices[0].message.content
  },
)

// Test deeply nested captures
const deeplyNestedTest = capture(
  {
    name: "level-1",
    tags: ["level-1-tag"],
    sessionId: "level-1-session",
    userId: "level-1-user",
    metadata: { level: 1, shared: "level-1" },
  },
  async () => {
    const level2 = capture(
      {
        name: "level-2",
        tags: ["level-2-tag"],
        sessionId: "level-2-session",
        userId: "level-2-user",
        metadata: { level: 2, shared: "level-2" },
      },
      async () => {
        const level3 = capture(
          {
            name: "level-3",
            tags: ["level-3-tag"],
            sessionId: "level-3-session",
            userId: "level-3-user",
            metadata: { level: 3, shared: "level-3" },
          },
          async () => {
            const response = await openai.chat.completions.create({
              model: "gpt-4o-mini",
              messages: [{ role: "user", content: "Say 'Level 3' in exactly 2 words." }],
              max_tokens: 50,
            })
            return response.choices[0].message.content
          },
        )

        const response = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [{ role: "user", content: "Say 'Level 2' in exactly 2 words." }],
          max_tokens: 50,
        })

        return {
          level3Result: await level3(),
          level2Result: response.choices[0].message.content,
        }
      },
    )

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: "Say 'Level 1' in exactly 2 words." }],
      max_tokens: 50,
    })

    return {
      nested: await level2(),
      level1Result: response.choices[0].message.content,
    }
  },
)

async function main() {
  console.log("Testing nested capture context merging...")

  console.log("\n1. Testing decorator-style nested captures...")
  const result1 = await outerFunction()
  console.log("Outer function result:", result1)

  console.log("\n2. Testing deeply nested captures (3 levels)...")
  const result2 = await deeplyNestedTest()
  console.log("Deeply nested result:", result2)

  console.log("\nFlushing telemetry...")
  await latitude.flush()

  console.log("\nDone! Check Latitude dashboard for verification:")
  console.log("- Inner spans should have: tags=[outer-tag, shared-tag, inner-tag] (deduplicated)")
  console.log("- Inner spans should have: sessionId=inner-session, userId=inner-user (overridden)")
  console.log("- Inner spans should have: metadata with shared_key=inner_shared (overridden)")
  console.log("- Outer spans should retain original context")
}

main().catch(console.error)
