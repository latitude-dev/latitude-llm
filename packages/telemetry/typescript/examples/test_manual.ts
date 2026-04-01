/**
 * Test Manual instrumentation against local Latitude instance.
 *
 * Required env vars:
 * - LATITUDE_API_KEY
 * - LATITUDE_PROJECT_SLUG
 *
 * Uses raw OpenTelemetry tracer API with GenAI semantic conventions.
 * No provider SDK needed — simulates a multi-turn agent conversation.
 */

import { SpanKind, SpanStatusCode } from '@opentelemetry/api'
import { LatitudeTelemetry } from '../src'

const telemetry = new LatitudeTelemetry(process.env.LATITUDE_API_KEY!, process.env.LATITUDE_PROJECT_SLUG!, {
  disableBatch: true,
})

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// ─── Completion spans ────────────────────────────────────

async function runFirstCompletion(): Promise<void> {
  await telemetry.tracer.startActiveSpan(
    'chat openai/gpt-4o',
    { kind: SpanKind.CLIENT },
    async (span) => {
      span.setAttribute('gen_ai.operation.name', 'chat')
      span.setAttribute('gen_ai.system', 'openai')
      span.setAttribute('gen_ai.request.model', 'gpt-4o')
      span.setAttribute('gen_ai.request.temperature', 0.7)
      span.setAttribute('gen_ai.request.max_tokens', 2048)

      // Input messages (Traceloop indexed format)
      span.setAttribute('gen_ai.prompt.0.role', 'system')
      span.setAttribute('gen_ai.prompt.0.content', 'You are a helpful travel planning assistant.')
      span.setAttribute('gen_ai.prompt.1.role', 'user')
      span.setAttribute('gen_ai.prompt.1.content', 'Plan a weekend trip to Barcelona.')

      await sleep(800)

      // Output
      span.setAttribute('gen_ai.completion.0.role', 'assistant')
      span.setAttribute('gen_ai.completion.0.content', 'Let me check the weather and find attractions for you.')
      span.setAttribute('gen_ai.completion.0.finish_reason', 'tool_calls')

      // Usage
      span.setAttribute('gen_ai.response.model', 'gpt-4o-2024-08-06')
      span.setAttribute('gen_ai.usage.prompt_tokens', 85)
      span.setAttribute('gen_ai.usage.completion_tokens', 42)
      span.setAttributes({ 'gen_ai.response.finish_reasons': ['tool_calls'] })

      span.setStatus({ code: SpanStatusCode.OK })
      span.end()
    },
  )
}

// ─── Tool execution spans ────────────────────────────────

async function runToolExecutions(): Promise<void> {
  // Successful tool
  await telemetry.tracer.startActiveSpan(
    'execute_tool get_weather',
    { kind: SpanKind.INTERNAL },
    async (span) => {
      span.setAttribute('gen_ai.operation.name', 'execute_tool')
      span.setAttribute('gen_ai.tool.name', 'get_weather')
      span.setAttribute('gen_ai.tool.call.id', 'call_weather_1')
      span.setAttribute('gen_ai.tool.call.arguments', JSON.stringify({ city: 'Barcelona' }))

      await sleep(300)

      span.setAttribute('gen_ai.tool.call.result', JSON.stringify({ temp: 22, condition: 'sunny' }))
      span.setStatus({ code: SpanStatusCode.OK })
      span.end()
    },
  )

  // Failed tool
  await telemetry.tracer.startActiveSpan(
    'execute_tool book_hotel',
    { kind: SpanKind.INTERNAL },
    async (span) => {
      span.setAttribute('gen_ai.operation.name', 'execute_tool')
      span.setAttribute('gen_ai.tool.name', 'book_hotel')
      span.setAttribute('gen_ai.tool.call.id', 'call_hotel_1')
      span.setAttribute('gen_ai.tool.call.arguments', JSON.stringify({ city: 'Barcelona', checkin: '2026-04-15' }))

      await sleep(200)

      const error = new Error('No rooms available for the requested dates')
      span.setAttribute('error.type', 'BookingUnavailableError')
      span.setStatus({ code: SpanStatusCode.ERROR, message: error.message })
      span.recordException(error)
      span.end()
    },
  )
}

// ─── Second completion with tool results ─────────────────

async function runSecondCompletion(): Promise<void> {
  await telemetry.tracer.startActiveSpan(
    'chat openai/gpt-4o',
    { kind: SpanKind.CLIENT },
    async (span) => {
      span.setAttribute('gen_ai.operation.name', 'chat')
      span.setAttribute('gen_ai.system', 'openai')
      span.setAttribute('gen_ai.request.model', 'gpt-4o')

      span.setAttribute('gen_ai.prompt.0.role', 'tool')
      span.setAttribute('gen_ai.prompt.0.content', '{"temp":22,"condition":"sunny"}')
      span.setAttribute('gen_ai.prompt.1.role', 'tool')
      span.setAttribute('gen_ai.prompt.1.content', 'BookingUnavailableError: No rooms available')

      await sleep(600)

      span.setAttribute('gen_ai.completion.0.role', 'assistant')
      span.setAttribute('gen_ai.completion.0.content',
        'The weather in Barcelona is 22°C and sunny! Unfortunately the hotel booking failed. Let me search for attractions instead.')
      span.setAttribute('gen_ai.completion.0.finish_reason', 'stop')

      span.setAttribute('gen_ai.response.model', 'gpt-4o-2024-08-06')
      span.setAttribute('gen_ai.usage.prompt_tokens', 320)
      span.setAttribute('gen_ai.usage.completion_tokens', 95)
      span.setAttributes({ 'gen_ai.response.finish_reasons': ['stop'] })

      span.setStatus({ code: SpanStatusCode.OK })
      span.end()
    },
  )
}

// ─── Third completion using a different provider ─────────

async function runAnthropicCompletion(): Promise<void> {
  await telemetry.tracer.startActiveSpan(
    'chat anthropic/claude-3-opus',
    { kind: SpanKind.CLIENT },
    async (span) => {
      span.setAttribute('gen_ai.operation.name', 'chat')
      span.setAttribute('gen_ai.system', 'anthropic')
      span.setAttribute('gen_ai.request.model', 'claude-3-opus-20240229')
      span.setAttribute('gen_ai.request.temperature', 0.5)
      span.setAttribute('gen_ai.request.max_tokens', 4096)

      span.setAttribute('gen_ai.prompt.0.role', 'user')
      span.setAttribute('gen_ai.prompt.0.content', 'Summarize the Barcelona trip plan so far.')

      await sleep(900)

      span.setAttribute('gen_ai.completion.0.role', 'assistant')
      span.setAttribute('gen_ai.completion.0.content',
        '## Barcelona Weekend Trip\n\n- **Weather**: 22°C, sunny\n- **Hotel**: Still looking for options\n- **Attractions**: Sagrada Familia, Park Güell, La Rambla')
      span.setAttribute('gen_ai.completion.0.finish_reason', 'end_turn')

      span.setAttribute('gen_ai.response.model', 'claude-3-opus-20240229')
      span.setAttribute('gen_ai.usage.prompt_tokens', 480)
      span.setAttribute('gen_ai.usage.completion_tokens', 120)
      span.setAttributes({ 'gen_ai.response.finish_reasons': ['end_turn'] })

      span.setStatus({ code: SpanStatusCode.OK })
      span.end()
    },
  )
}

// ─── Main ────────────────────────────────────────────────

async function main() {
  await telemetry.capture(
    { tags: ['test', 'manual'], sessionId: 'example', metadata: { scenario: 'travel-planner' } },
    async () => {
      await runFirstCompletion()
      await runToolExecutions()
      await runSecondCompletion()
      await runAnthropicCompletion()
    },
  )

  await telemetry.flush()
}

main().catch(console.error)
