/**
 * Test Anthropic instrumentation against local Latitude instance.
 *
 * Required env vars:
 * - LATITUDE_API_KEY
 * - LATITUDE_PROJECT_SLUG
 * - ANTHROPIC_API_KEY
 *
 * Install: npm install @anthropic-ai/sdk
 *
 * Note: this example uses composable mode (NodeTracerProvider +
 * registerLatitudeInstrumentations) instead of `initLatitude` because
 * `initLatitude` doesn't forward a `modules` option, and the auto-require in
 * `tryRequire` strips the module namespace down to the default export, which
 * trips up traceloop's anthropic instrumentation. Passing the namespace
 * explicitly via `modules: { anthropic: AnthropicNS }` avoids that.
 *
 * FIXME: Fix telemetry package to avoid needing this workaround.
 */

import * as AnthropicNS from "@anthropic-ai/sdk"
import { context, propagation } from "@opentelemetry/api"
import { AsyncLocalStorageContextManager } from "@opentelemetry/context-async-hooks"
import { CompositePropagator, W3CBaggagePropagator, W3CTraceContextPropagator } from "@opentelemetry/core"
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node"
import { capture, LatitudeSpanProcessor, registerLatitudeInstrumentations } from "../src"

const Anthropic = AnthropicNS.default

const contextManager = new AsyncLocalStorageContextManager()
contextManager.enable()
context.setGlobalContextManager(contextManager)
propagation.setGlobalPropagator(
  new CompositePropagator({ propagators: [new W3CTraceContextPropagator(), new W3CBaggagePropagator()] }),
)

const provider = new NodeTracerProvider({
  spanProcessors: [
    new LatitudeSpanProcessor(process.env.LATITUDE_API_KEY!, process.env.LATITUDE_PROJECT_SLUG!, {
      disableBatch: true,
    }),
  ],
})

const ready = registerLatitudeInstrumentations({
  instrumentations: ["anthropic"],
  modules: { anthropic: AnthropicNS },
  tracerProvider: provider,
})

provider.register()

async function main() {
  await ready

  const client = new Anthropic()

  const result = await capture(
    "anthropic-chat",
    async () => {
      const response = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 50,
        messages: [
          {
            role: "user",
            content: "Say 'Hello from Anthropic!' in exactly 5 words.",
          },
        ],
      })

      const content = response.content[0]
      return content?.type === "text" ? content.text : ""
    },
    { tags: ["test", "anthropic"], sessionId: "example" },
  )

  console.log("Anthropic response:", result)
  await provider.forceFlush()
  console.log("Flushed to Latitude.")
}

main().catch(console.error)
