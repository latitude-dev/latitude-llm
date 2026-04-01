/**
 * Test Manual instrumentation against local Latitude instance.
 *
 * Required env vars:
 * - LATITUDE_API_KEY
 * - LATITUDE_PROJECT_SLUG
 *
 * Uses raw OpenTelemetry tracer API to create custom spans.
 */

import { SpanKind, SpanStatusCode } from '@opentelemetry/api'
import { LatitudeTelemetry } from '../src'

const telemetry = new LatitudeTelemetry(process.env.LATITUDE_API_KEY!, process.env.LATITUDE_PROJECT_SLUG!, {
  disableBatch: true,
})

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function simulateHttpRequest(
  url: string,
  method: string = 'POST',
  requestBody: Record<string, unknown> = {},
  responseBody: Record<string, unknown> = {},
  statusCode: number = 200,
): Promise<void> {
  const tracer = telemetry.tracer

  await tracer.startActiveSpan(
    `HTTP ${method} ${url}`,
    { kind: SpanKind.CLIENT },
    async (span) => {
      span.setAttribute('http.method', method)
      span.setAttribute('http.url', url)
      span.setAttribute('http.request.body', JSON.stringify(requestBody))

      await sleep(1 * 1000)

      span.setAttribute('http.status_code', statusCode)
      span.setAttribute('http.response.body', JSON.stringify(responseBody))

      if (statusCode >= 400) {
        span.setStatus({ code: SpanStatusCode.ERROR, message: `HTTP ${statusCode}` })
      } else {
        span.setStatus({ code: SpanStatusCode.OK })
      }

      span.end()
    },
  )
}

const SYSTEM_PROMPT =
  'You are an advanced AI assistant with vision capabilities, access to tools, and the ability to process files. You help users with complex multi-modal tasks.'

const USER_PROMPT =
  'Hello! I have an image of a document and a CSV file with some data. Can you analyze both and tell me what you see?'

async function runFirstCompletion(): Promise<string> {
  const tracer = telemetry.tracer

  return await tracer.startActiveSpan(
    'completion: Initial Analysis Request',
    { kind: SpanKind.CLIENT },
    async (span) => {
      span.setAttribute('llm.provider', 'openai')
      span.setAttribute('llm.model', 'gpt-4-vision-preview')
      span.setAttribute('llm.temperature', 0.7)
      span.setAttribute('llm.max_tokens', 2048)
      span.setAttribute('llm.input', JSON.stringify([
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: USER_PROMPT },
      ]))

      await simulateHttpRequest(
        'https://api.openai.com/v1/chat/completions',
        'POST',
        {
          model: 'gpt-4-vision-preview',
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: USER_PROMPT },
          ],
          temperature: 0.7,
          max_tokens: 2048,
        },
        {
          id: 'chatcmpl-abc123',
          object: 'chat.completion',
          model: 'gpt-4-vision-preview',
          choices: [
            {
              message: {
                role: 'assistant',
                content:
                  'I can see both the image and the CSV file. Let me analyze them for you.',
              },
              finish_reason: 'tool_calls',
            },
          ],
          usage: { prompt_tokens: 450, completion_tokens: 180 },
        },
      )

      const output =
        'I can see both the image and the CSV file. Let me analyze them for you.'
      span.setAttribute('llm.output', output)
      span.setAttribute('llm.tokens.prompt', 450)
      span.setAttribute('llm.tokens.completion', 180)
      span.setAttribute('llm.finish_reason', 'tool_calls')
      span.setStatus({ code: SpanStatusCode.OK })
      span.end()

      return output
    },
  )
}

async function runToolExecutions(): Promise<{ csvResult: unknown; weatherError: string }> {
  const tracer = telemetry.tracer

  const csvResult = await tracer.startActiveSpan(
    'tool: parse_csv',
    { kind: SpanKind.INTERNAL },
    async (span) => {
      span.setAttribute('tool.call_id', 'call_parse_csv_001')
      span.setAttribute('tool.arguments', JSON.stringify({
        data: 'name,age,city\nAlice,30,New York\nBob,25,San Francisco\nCharlie,35,Los Angeles',
        includeStatistics: true,
      }))

      await sleep(500)

      const result = {
        rows: 3,
        columns: ['name', 'age', 'city'],
        statistics: {
          averageAge: 30,
          cities: ['New York', 'San Francisco', 'Los Angeles'],
        },
        parsed: [
          { name: 'Alice', age: 30, city: 'New York' },
          { name: 'Bob', age: 25, city: 'San Francisco' },
          { name: 'Charlie', age: 35, city: 'Los Angeles' },
        ],
      }

      span.setAttribute('tool.result', JSON.stringify(result))
      span.setStatus({ code: SpanStatusCode.OK })
      span.end()
      return result
    },
  )

  const weatherError = await tracer.startActiveSpan(
    'tool: get_weather',
    { kind: SpanKind.INTERNAL },
    async (span) => {
      span.setAttribute('tool.call_id', 'call_get_weather_002')
      span.setAttribute('tool.arguments', JSON.stringify({
        cities: ['New York', 'San Francisco', 'Los Angeles'],
      }))

      const errorMessage = 'Weather API rate limit exceeded. Please try again in 60 seconds.'
      span.setStatus({ code: SpanStatusCode.ERROR, message: errorMessage })
      span.recordException(new Error(errorMessage))
      span.end()
      return errorMessage
    },
  )

  return { csvResult, weatherError }
}

async function runSecondCompletion(): Promise<string> {
  const tracer = telemetry.tracer

  return await tracer.startActiveSpan(
    'completion: Analysis Response with Tool Results',
    { kind: SpanKind.CLIENT },
    async (span) => {
      span.setAttribute('llm.provider', 'openai')
      span.setAttribute('llm.model', 'gpt-4-vision-preview')
      span.setAttribute('llm.temperature', 0.7)
      span.setAttribute('llm.max_tokens', 2048)

      await simulateHttpRequest(
        'https://api.openai.com/v1/chat/completions',
        'POST',
        { model: 'gpt-4-vision-preview', messages: [] },
        {
          id: 'chatcmpl-def456',
          choices: [
            {
              message: {
                role: 'assistant',
                content:
                  'Here is my analysis of your data:\n\n## CSV Analysis\nThe CSV contains 3 people with an average age of 30.\n\n## Weather\nUnable to fetch weather due to rate limit.',
              },
              finish_reason: 'stop',
            },
          ],
          usage: { prompt_tokens: 720, completion_tokens: 245 },
        },
      )

      const output =
        'Here is my analysis of your data:\n\n## CSV Analysis\nThe CSV contains 3 people with an average age of 30.\n\n## Weather\nUnable to fetch weather due to rate limit.'
      span.setAttribute('llm.output', output)
      span.setAttribute('llm.tokens.prompt', 720)
      span.setAttribute('llm.tokens.completion', 245)
      span.setAttribute('llm.finish_reason', 'stop')
      span.setStatus({ code: SpanStatusCode.OK })
      span.end()

      return output
    },
  )
}

async function runMultiToolCompletion(): Promise<string> {
  const tracer = telemetry.tracer

  return await tracer.startActiveSpan(
    'completion: Multi-tool Request',
    { kind: SpanKind.CLIENT },
    async (span) => {
      span.setAttribute('llm.provider', 'anthropic')
      span.setAttribute('llm.model', 'claude-3-opus-20240229')
      span.setAttribute('llm.temperature', 0.5)
      span.setAttribute('llm.max_tokens', 4096)

      await simulateHttpRequest(
        'https://api.anthropic.com/v1/messages',
        'POST',
        { model: 'claude-3-opus-20240229', max_tokens: 4096 },
        {
          id: 'msg-xyz789',
          type: 'message',
          stop_reason: 'tool_use',
          usage: { input_tokens: 150, output_tokens: 320 },
        },
      )

      span.setAttribute('llm.tokens.prompt', 150)
      span.setAttribute('llm.tokens.completion', 320)
      span.setAttribute('llm.finish_reason', 'tool_use')
      span.setStatus({ code: SpanStatusCode.OK })
      span.end()

      return 'I will search for AI news and calculate the statistics you need.'
    },
  )
}

async function runMultipleToolExecutions(): Promise<void> {
  const tracer = telemetry.tracer

  await tracer.startActiveSpan(
    'tool: web_search',
    { kind: SpanKind.INTERNAL },
    async (span) => {
      span.setAttribute('tool.call_id', 'call_web_search_003')
      span.setAttribute('tool.arguments', JSON.stringify({
        query: 'latest AI news January 2026',
        maxResults: 5,
      }))

      await sleep(350)

      const results = {
        results: [
          { title: 'OpenAI announces GPT-5', url: 'https://example.com/gpt5' },
          { title: 'Google DeepMind achieves new milestone', url: 'https://example.com/deepmind' },
          { title: 'AI regulation updates worldwide', url: 'https://example.com/regulation' },
        ],
      }

      span.setAttribute('tool.result', JSON.stringify(results))
      span.setStatus({ code: SpanStatusCode.OK })
      span.end()
    },
  )

  await tracer.startActiveSpan(
    'tool: calculator',
    { kind: SpanKind.INTERNAL },
    async (span) => {
      span.setAttribute('tool.call_id', 'call_calculator_004')
      span.setAttribute('tool.arguments', JSON.stringify({
        operation: 'statistics',
        values: [30, 25, 35, 28, 32, 29, 31],
      }))

      await sleep(500)

      const statsResult = {
        mean: 30, median: 30, min: 25, max: 35, standardDeviation: 3.16, count: 7,
      }

      span.setAttribute('tool.result', JSON.stringify(statsResult))
      span.setStatus({ code: SpanStatusCode.OK })
      span.end()
    },
  )

  await tracer.startActiveSpan(
    'tool: generate_chart',
    { kind: SpanKind.INTERNAL },
    async (span) => {
      span.setAttribute('tool.call_id', 'call_generate_chart_005')
      span.setAttribute('tool.arguments', JSON.stringify({
        type: 'bar',
        data: { labels: ['Alice', 'Bob', 'Charlie'], values: [30, 25, 35] },
        title: 'Age Distribution',
      }))

      await sleep(750)

      span.setAttribute('tool.result', JSON.stringify({
        chartUrl: 'https://charts.example.com/chart-abc123.png',
        format: 'png',
        dimensions: { width: 800, height: 600 },
      }))
      span.setStatus({ code: SpanStatusCode.OK })
      span.end()
    },
  )
}

async function runFinalCompletion(): Promise<string> {
  const tracer = telemetry.tracer

  return await tracer.startActiveSpan(
    'completion: Final Summary Response',
    { kind: SpanKind.CLIENT },
    async (span) => {
      span.setAttribute('llm.provider', 'anthropic')
      span.setAttribute('llm.model', 'claude-3-opus-20240229')
      span.setAttribute('llm.temperature', 0.5)
      span.setAttribute('llm.max_tokens', 4096)

      await simulateHttpRequest(
        'https://api.anthropic.com/v1/messages',
        'POST',
        { model: 'claude-3-opus-20240229' },
        {
          id: 'msg-final123',
          type: 'message',
          stop_reason: 'end_turn',
          usage: { input_tokens: 980, output_tokens: 450 },
        },
      )

      const output =
        '## Here are the results:\n\n### AI News\n1. OpenAI announces GPT-5\n2. DeepMind milestone\n3. AI regulation updates\n\n### Statistics\nMean: 30, Median: 30, StdDev: 3.16\n\n### Chart\nBar chart generated for age distribution.'

      span.setAttribute('llm.output', output)
      span.setAttribute('llm.tokens.prompt', 980)
      span.setAttribute('llm.tokens.completion', 450)
      span.setAttribute('llm.finish_reason', 'end_turn')
      span.setStatus({ code: SpanStatusCode.OK })
      span.end()

      return output
    },
  )
}

async function main() {
  await telemetry.capture(
    { tags: ['test', 'manual'], sessionId: 'example' },
    async () => {
      await runFirstCompletion()
      await runToolExecutions()
      await runSecondCompletion()
      await runMultiToolCompletion()
      await runMultipleToolExecutions()
      await runFinalCompletion()
    },
  )

  await telemetry.flush()
}

main().catch(console.error)
