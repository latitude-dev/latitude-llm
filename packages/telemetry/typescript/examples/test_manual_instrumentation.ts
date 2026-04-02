/**
 * Test manual span creation within capture() boundaries.
 *
 * This verifies that manually created spans (using OpenTelemetry's tracer directly)
 * receive latitude.* attributes from the capture() context and pass the smart filter.
 *
 * This is the pattern for adding custom spans around non-LLM operations while keeping
 * them within a Latitude trace.
 *
 * Required env vars:
 * - LATITUDE_API_KEY
 * - LATITUDE_PROJECT_SLUG
 * - OPENAI_API_KEY
 *
 * Install: npm install openai
 */

import { trace } from "@opentelemetry/api"
import OpenAI from "openai"
import { capture, initLatitude } from "../src"

// Initialize telemetry
const latitude = initLatitude({
  apiKey: process.env.LATITUDE_API_KEY!,
  projectSlug: process.env.LATITUDE_PROJECT_SLUG!,
  instrumentations: ["openai"],
  disableBatch: true,
})

const openai = new OpenAI()

async function main() {
  console.log("=".repeat(60))
  console.log("Testing Manual Span Creation within Capture()")
  console.log("=".repeat(60))

  console.log("\n1. Testing simple capture with manual spans...")
  const result1 = await capture(
    "agent-with-custom-spans",
    async () => {
      // Get tracer from the provider - this is a standard OTel tracer
      const tracer = trace.getTracer("custom.manual.instrumentation")

      // Create a custom span for a non-LLM operation
      // This span will receive latitude.tags, latitude.metadata, etc.
      // from LatitudeSpanProcessor and pass the smart filter
      await tracer.startActiveSpan("database.query", async (span) => {
        span.setAttribute("db.system", "postgresql")
        span.setAttribute("db.statement", "SELECT * FROM users WHERE id = 123")

        // Simulate database work
        await new Promise((resolve) => setTimeout(resolve, 100))

        span.setAttribute("db.rows_affected", 1)
        span.end()
      })

      // Another custom span for business logic
      await tracer.startActiveSpan("business.validate", async (span) => {
        span.setAttribute("validation.rules_applied", ["email_format", "required_fields"])
        span.setAttribute("validation.result", "success")
        span.end()
      })

      // Now make an LLM call - this will also be traced
      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: "Say 'Custom spans work!' in exactly 3 words." }],
        max_tokens: 50,
      })

      // One more custom span for post-processing
      await tracer.startActiveSpan("response.format", async (span) => {
        span.setAttribute("format.type", "markdown")
        span.setAttribute("format.includes_citations", false)
        span.end()
      })

      return response.choices[0].message.content
    },
    {
      tags: ["manual-instrumentation", "test"],
      sessionId: "manual-test-session",
      userId: "manual-test-user",
      metadata: { agent_type: "custom-span-test" },
    },
  )
  console.log(`Result: ${result1}`)
  console.log("Expected spans: database.query, business.validate, response.format (all with latitude.* attributes)")

  console.log("\n2. Testing nested captures with manual spans...")

  // Outer capture with manual spans
  const result2 = await capture(
    "nested-capture-with-manual-spans",
    async () => {
      const tracer = trace.getTracer("custom.manual.instrumentation")

      // Manual span in outer context
      await tracer.startActiveSpan("outer.preprocess", async (span) => {
        span.setAttribute("preprocess.step", "data_loading")
        span.end()
      })

      // Call inner function (also has capture)
      const innerResult = await capture(
        "inner-capture-manual",
        async () => {
          const innerTracer = trace.getTracer("custom.manual.instrumentation")

          // Manual span in inner context
          await innerTracer.startActiveSpan("inner.llm_prep", async (span) => {
            span.setAttribute("prep.system_prompt_version", "v2.1")
            span.end()
          })

          const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [{ role: "user", content: "Say 'Nested manual spans work!' in exactly 4 words." }],
            max_tokens: 50,
          })

          return response.choices[0].message.content
        },
        {
          tags: ["inner-manual"],
          metadata: { inner: true },
        },
      )

      // Manual span after inner call
      await tracer.startActiveSpan("outer.postprocess", async (span) => {
        span.setAttribute("postprocess.step", "result_formatting")
        span.end()
      })

      return innerResult
    },
    {
      tags: ["nested-manual"],
      sessionId: "nested-session",
      metadata: { outer: true },
    },
  )
  console.log(`Result: ${result2}`)
  console.log("Expected spans: outer.preprocess, outer.postprocess, inner.llm_prep (with merged context)")

  console.log("\n3. Testing callback pattern with manual spans...")
  const result3 = await capture(
    "callback-manual-test",
    async () => {
      const tracer = trace.getTracer("custom.manual.instrumentation")

      // Manual span in callback
      await tracer.startActiveSpan("callback.data_fetch", async (span) => {
        span.setAttribute("data.source", "api")
        span.setAttribute("data.items_count", 42)
        span.end()
      })

      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: "Say 'Callback manual spans work!' in exactly 4 words." }],
        max_tokens: 50,
      })

      return response.choices[0].message.content
    },
    {
      tags: ["callback-manual"],
      sessionId: "callback-session",
      metadata: { test_type: "callback" },
    },
  )
  console.log(`Result: ${result3}`)
  console.log("Expected spans: callback.data_fetch (with latitude.* attributes)")

  console.log("\nFlushing telemetry...")
  await latitude.flush()

  console.log("\n" + "=".repeat(60))
  console.log("Done! Check Latitude dashboard for verification:")
  console.log("=".repeat(60))
  console.log("- All custom spans should appear in the trace")
  console.log("- Custom spans should have latitude.tags, latitude.metadata attributes")
  console.log("- Nested spans should have merged context from parent captures")
  console.log("- Verify smart filter allows these spans through (latitude.* attribute check)")
}

main().catch(console.error)
