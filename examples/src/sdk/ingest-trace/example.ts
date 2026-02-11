import { LatitudeTelemetry } from '@latitude-data/telemetry'
import { LogSources } from '@latitude-data/sdk'
import { faker } from '@faker-js/faker'
import { v4 as uuid } from 'uuid'

type ToolCall = {
  id: string
  name: string
  arguments: Record<string, unknown>
  result: unknown
  startedAt: Date
  completedAt: Date
}

type LogEntry = {
  id: string
  path: string
  createdAt: Date
  completedAt: Date
  messages: Array<{ role: string; content: string }>
  response: string
  model: string
  provider: string
  promptTokens: number
  completionTokens: number
  toolCalls?: ToolCall[]
}

// Fake logs database - simulating historical LLM calls
const FAKE_LOGS_DB: LogEntry[] = [
  // Simple completion without tools
  {
    id: uuid(),
    path: 'customer-support/greeting',
    createdAt: faker.date.recent({ days: 7 }),
    completedAt: new Date(),
    messages: [
      { role: 'user', content: faker.lorem.sentence() },
    ],
    response: faker.lorem.paragraph(),
    model: 'gpt-4o-mini',
    provider: 'openai',
    promptTokens: faker.number.int({ min: 10, max: 100 }),
    completionTokens: faker.number.int({ min: 20, max: 200 }),
  },
  // Completion with tool calls (weather lookup)
  {
    id: uuid(),
    path: 'assistant/weather',
    createdAt: faker.date.recent({ days: 3 }),
    completedAt: new Date(),
    messages: [
      { role: 'user', content: `What's the weather in ${faker.location.city()}?` },
    ],
    response: `The current weather is ${faker.number.int({ min: 15, max: 35 })}°C with ${faker.helpers.arrayElement(['sunny skies', 'partly cloudy', 'light rain', 'overcast'])}`,
    model: 'gpt-4o',
    provider: 'openai',
    promptTokens: faker.number.int({ min: 50, max: 150 }),
    completionTokens: faker.number.int({ min: 30, max: 100 }),
    toolCalls: [
      {
        id: `call_${faker.string.alphanumeric(24)}`,
        name: 'get_weather',
        arguments: {
          location: faker.location.city(),
          units: 'celsius',
        },
        result: {
          temperature: faker.number.int({ min: 15, max: 35 }),
          condition: faker.helpers.arrayElement(['sunny', 'cloudy', 'rainy']),
          humidity: faker.number.int({ min: 30, max: 90 }),
        },
        startedAt: new Date(),
        completedAt: new Date(),
      },
    ],
  },
  // Completion with multiple tool calls (search + database)
  {
    id: uuid(),
    path: 'assistant/research',
    createdAt: faker.date.recent({ days: 1 }),
    completedAt: new Date(),
    messages: [
      { role: 'user', content: `Find information about ${faker.company.name()} and save it to my notes` },
    ],
    response: faker.lorem.paragraphs(2),
    model: 'claude-3-5-sonnet-20241022',
    provider: 'anthropic',
    promptTokens: faker.number.int({ min: 100, max: 300 }),
    completionTokens: faker.number.int({ min: 150, max: 400 }),
    toolCalls: [
      {
        id: `call_${faker.string.alphanumeric(24)}`,
        name: 'web_search',
        arguments: {
          query: faker.company.name(),
          max_results: 5,
        },
        result: {
          results: [
            { title: faker.lorem.sentence(), url: faker.internet.url(), snippet: faker.lorem.paragraph() },
            { title: faker.lorem.sentence(), url: faker.internet.url(), snippet: faker.lorem.paragraph() },
          ],
        },
        startedAt: new Date(),
        completedAt: new Date(),
      },
      {
        id: `call_${faker.string.alphanumeric(24)}`,
        name: 'save_note',
        arguments: {
          title: faker.lorem.sentence(),
          content: faker.lorem.paragraph(),
          tags: [faker.lorem.word(), faker.lorem.word()],
        },
        result: {
          noteId: faker.string.uuid(),
          savedAt: faker.date.recent().toISOString(),
        },
        startedAt: new Date(),
        completedAt: new Date(),
      },
    ],
  },
]

// Fix timestamps to have proper durations
FAKE_LOGS_DB.forEach((log) => {
  const baseDuration = faker.number.int({ min: 500, max: 3000 })
  log.completedAt = new Date(log.createdAt.getTime() + baseDuration)

  if (log.toolCalls) {
    let toolOffset = 50
    log.toolCalls.forEach((tool) => {
      const toolDuration = faker.number.int({ min: 100, max: 500 })
      tool.startedAt = new Date(log.createdAt.getTime() + toolOffset)
      tool.completedAt = new Date(tool.startedAt.getTime() + toolDuration)
      toolOffset += toolDuration + 20
    })
  }
})

const telemetry = new LatitudeTelemetry(process.env.LATITUDE_API_KEY!, {
  disableBatch: true,
})

async function ingestLog(log: LogEntry, projectId: number) {
  console.log(`\nIngesting log: ${log.id}`)
  console.log(`  Path: ${log.path}`)
  console.log(`  Provider: ${log.provider}/${log.model}`)
  console.log(`  Duration: ${log.completedAt.getTime() - log.createdAt.getTime()}ms`)
  if (log.toolCalls?.length) {
    console.log(`  Tool calls: ${log.toolCalls.map((t) => t.name).join(', ')}`)
  }

  // Create prompt span
  const promptSpan = telemetry.span.prompt({
    documentLogUuid: log.id,
    promptUuid: log.path,
    projectId,
    versionUuid: 'live',
    template: `User message: {{message}}`,
    parameters: { message: log.messages[0]?.content },
    source: LogSources.API,
    startTime: log.createdAt,
  })

  // Create completion span
  const completionSpan = telemetry.span.completion(
    {
      provider: log.provider,
      model: log.model,
      input: log.messages,
      startTime: log.createdAt,
    },
    promptSpan.context,
  )

  // Create tool spans if present
  if (log.toolCalls) {
    for (const toolCall of log.toolCalls) {
      const toolSpan = telemetry.span.tool(
        {
          name: toolCall.name,
          call: {
            id: toolCall.id,
            arguments: toolCall.arguments,
          },
          startTime: toolCall.startedAt,
        },
        completionSpan.context,
      )

      toolSpan.end({
        result: {
          value: toolCall.result,
          isError: false,
        },
        endTime: toolCall.completedAt,
      })
    }
  }

  // End completion span
  completionSpan.end({
    output: [{ role: 'assistant', content: log.response }],
    tokens: {
      prompt: log.promptTokens,
      completion: log.completionTokens,
    },
    finishReason: 'stop',
    endTime: log.completedAt,
  })

  // End prompt span
  promptSpan.end({
    endTime: new Date(log.completedAt.getTime() + 5),
  })
}

async function run() {
  const projectId = Number(process.env.PROJECT_ID)

  console.log('='.repeat(50))
  console.log('Backfilling historical logs to Latitude')
  console.log(`Total logs to ingest: ${FAKE_LOGS_DB.length}`)
  console.log('='.repeat(50))

  for (const log of FAKE_LOGS_DB) {
    await ingestLog(log, projectId)
  }

  await telemetry.flush()

  console.log('\n' + '='.repeat(50))
  console.log('All traces backfilled successfully!')
  console.log('='.repeat(50))
}

run()
