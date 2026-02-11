import { Latitude, LogSources } from '@latitude-data/sdk'
import { faker } from '@faker-js/faker'
import { v4 as uuid } from 'uuid'

// ============================================================
// BackfillLog Format - What users send to sdk.traces.manual()
// ============================================================

type BackfillToolCall = {
  id: string
  name: string
  arguments: Record<string, unknown>
  result: unknown
  isError?: boolean
  startedAt: Date
  completedAt: Date
}

type BackfillLog = {
  conversationId: string
  previousTraceId?: string
  path: string
  provider: string
  model: string
  input: Array<{ role: string; content: string }>
  output: string
  promptTokens?: number
  completionTokens?: number
  toolCalls?: BackfillToolCall[]
  startedAt: Date
  completedAt: Date
}

type ManualTracesParams = {
  projectId: number
  versionUuid?: string
  spans: BackfillLog[]
}

type ManualTracesResult = {
  traces: Array<{
    conversationId: string
    traceId: string
  }>
}

// ============================================================
// Example 1: Single turn
// ============================================================

const singleTurnLogs: BackfillLog[] = [
  {
    conversationId: uuid(),
    path: 'customer-support/greeting',
    provider: 'openai',
    model: 'gpt-4o-mini',
    input: [{ role: 'user', content: 'Hello, I need help with my order' }],
    output: 'Hi! I\'d be happy to help you with your order. Could you please provide your order number?',
    promptTokens: 25,
    completionTokens: 30,
    startedAt: new Date('2025-02-10T10:00:00Z'),
    completedAt: new Date('2025-02-10T10:00:01.500Z'),
  },
]

// ============================================================
// Example 2: Multi-turn conversation (ordered by time)
// ============================================================

const conversationId = uuid()

const multiTurnLogs: BackfillLog[] = [
  // Turn 1 - no previousTraceId
  {
    conversationId,
    path: 'assistant/weather',
    provider: 'openai',
    model: 'gpt-4o',
    input: [{ role: 'user', content: "What's the weather in Paris?" }],
    output: 'The weather in Paris is currently 22°C with sunny skies.',
    promptTokens: 15,
    completionTokens: 20,
    toolCalls: [
      {
        id: `call_${faker.string.alphanumeric(24)}`,
        name: 'get_weather',
        arguments: { location: 'Paris', units: 'celsius' },
        result: { temperature: 22, condition: 'sunny' },
        startedAt: new Date('2025-02-10T11:00:00.100Z'),
        completedAt: new Date('2025-02-10T11:00:00.400Z'),
      },
    ],
    startedAt: new Date('2025-02-10T11:00:00Z'),
    completedAt: new Date('2025-02-10T11:00:01.200Z'),
  },
  // Turn 2 - previousTraceId will be set by gateway (same conversationId, ordered by startedAt)
  {
    conversationId,
    path: 'assistant/weather',
    provider: 'openai',
    model: 'gpt-4o',
    input: [{ role: 'user', content: 'What about tomorrow?' }],
    output: 'Tomorrow in Paris will be slightly cooler at 18°C with partly cloudy skies.',
    promptTokens: 12,
    completionTokens: 25,
    toolCalls: [
      {
        id: `call_${faker.string.alphanumeric(24)}`,
        name: 'get_weather_forecast',
        arguments: { location: 'Paris', date: 'tomorrow' },
        result: { temperature: 18, condition: 'partly_cloudy' },
        startedAt: new Date('2025-02-10T11:01:00.100Z'),
        completedAt: new Date('2025-02-10T11:01:00.350Z'),
      },
    ],
    startedAt: new Date('2025-02-10T11:01:00Z'),
    completedAt: new Date('2025-02-10T11:01:01.000Z'),
  },
  // Turn 3 - no tool calls
  {
    conversationId,
    path: 'assistant/weather',
    provider: 'openai',
    model: 'gpt-4o',
    input: [{ role: 'user', content: 'Should I bring an umbrella?' }],
    output: "Based on the forecast, you probably won't need an umbrella tomorrow.",
    promptTokens: 10,
    completionTokens: 35,
    startedAt: new Date('2025-02-10T11:02:00Z'),
    completedAt: new Date('2025-02-10T11:02:00.800Z'),
  },
]

// ============================================================
// Example 3: Multiple independent conversations in one call
// ============================================================

const conversation1Id = uuid()
const conversation2Id = uuid()

const mixedLogs: BackfillLog[] = [
  // Conversation 1, Turn 1
  {
    conversationId: conversation1Id,
    path: 'support/billing',
    provider: 'openai',
    model: 'gpt-4o-mini',
    input: [{ role: 'user', content: 'I have a billing question' }],
    output: 'I can help with billing. What would you like to know?',
    promptTokens: 10,
    completionTokens: 15,
    startedAt: new Date('2025-02-10T09:00:00Z'),
    completedAt: new Date('2025-02-10T09:00:00.800Z'),
  },
  // Conversation 2, Turn 1
  {
    conversationId: conversation2Id,
    path: 'support/technical',
    provider: 'anthropic',
    model: 'claude-3-5-sonnet-20241022',
    input: [{ role: 'user', content: 'My API calls are failing' }],
    output: 'Let me help you debug that. What error are you seeing?',
    promptTokens: 12,
    completionTokens: 18,
    startedAt: new Date('2025-02-10T09:05:00Z'),
    completedAt: new Date('2025-02-10T09:05:01.200Z'),
  },
  // Conversation 1, Turn 2
  {
    conversationId: conversation1Id,
    path: 'support/billing',
    provider: 'openai',
    model: 'gpt-4o-mini',
    input: [{ role: 'user', content: 'Why was I charged twice?' }],
    output: 'Let me look into that for you. Can you provide your account email?',
    promptTokens: 15,
    completionTokens: 20,
    startedAt: new Date('2025-02-10T09:01:00Z'),
    completedAt: new Date('2025-02-10T09:01:01.000Z'),
  },
  // Conversation 2, Turn 2
  {
    conversationId: conversation2Id,
    path: 'support/technical',
    provider: 'anthropic',
    model: 'claude-3-5-sonnet-20241022',
    input: [{ role: 'user', content: 'Error 429 rate limited' }],
    output: 'That means you\'re hitting rate limits. Try adding exponential backoff.',
    promptTokens: 8,
    completionTokens: 22,
    startedAt: new Date('2025-02-10T09:06:00Z'),
    completedAt: new Date('2025-02-10T09:06:00.900Z'),
  },
]

// ============================================================
// Usage
// ============================================================

const sdk = new Latitude(process.env.LATITUDE_API_KEY!)

async function run() {
  const projectId = Number(process.env.PROJECT_ID)

  // Combine all spans into one array
  const allSpans: BackfillLog[] = [
    ...singleTurnLogs,
    ...multiTurnLogs,
    ...mixedLogs,
  ]

  console.log('='.repeat(50))
  console.log('Backfilling spans to Latitude')
  console.log(`Total spans: ${allSpans.length}`)
  console.log('='.repeat(50))

  // Single call to ingest all spans
  // Gateway groups by conversationId and orders by startedAt
  // to automatically link conversation turns
  const result = await sdk.traces.manual({
    projectId,
    versionUuid: 'live',
    spans: allSpans,
  })

  console.log(`\n✓ Ingested ${result.traces.length} traces`)

  // Group results by conversationId for display
  const byConversation = new Map<string, string[]>()
  result.traces.forEach((t) => {
    const traces = byConversation.get(t.conversationId) || []
    traces.push(t.traceId)
    byConversation.set(t.conversationId, traces)
  })

  console.log(`\nConversations created: ${byConversation.size}`)
  byConversation.forEach((traceIds, convId) => {
    console.log(`  ${convId}: ${traceIds.length} turn(s)`)
  })

  console.log('\n' + '='.repeat(50))
  console.log('Done!')
  console.log('='.repeat(50))
}

run()
