const baseUrl = process.env.GATEWAY_URL ?? 'http://localhost:8787'
const apiKey =
  process.env.LATITUDE_API_KEY ?? '5a1ea68f-e9cf-40fd-b9f7-34763c9f8248' // test api key, have a good day scrappers :wave:
const debugSse = process.env.DEBUG_SSE === '1'

const promptPath = 'gateway-run-chat-test'
const promptContent = `
---
provider: openai
model: gpt-4.1-mini
---

You are a concise assistant. Answer in two sentences.

Topic: {{ topic }}
`.trim()

type ProjectResponse = {
  project: { id: number; name: string }
  version: { uuid: string }
}

type RunResponse = {
  uuid: string
  response?: { text?: string }
}

type SseEvent = {
  event?: string
  data?: unknown
}

async function requestJson<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Request failed (${response.status}): ${text}`)
  }

  return (await response.json()) as T
}

function parseSseEvent(block: string): SseEvent | null {
  const lines = block.split('\n')
  const dataLines: string[] = []
  let event: string | undefined

  for (const line of lines) {
    const trimmed = line.trimEnd()
    if (trimmed.startsWith('event:')) {
      event = trimmed.slice('event:'.length).trim()
      continue
    }

    if (trimmed.startsWith('data:')) {
      dataLines.push(trimmed.slice('data:'.length).trim())
    }
  }

  const rawData = dataLines.join('\n')
  const data = rawData.length > 0 ? safeJsonParse(rawData) : undefined

  if (!event && data === undefined) return null
  return { event, data }
}

function safeJsonParse(value: string): unknown {
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}

async function requestSse(path: string, body: unknown): Promise<SseEvent[]> {
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Request failed (${response.status}): ${text}`)
  }

  const reader = response.body?.getReader()
  if (!reader) return []

  const decoder = new TextDecoder()
  const events: SseEvent[] = []
  let buffer = ''

  while (true) {
    const { value, done } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    buffer = buffer.replace(/\r\n/g, '\n')
    const parts = buffer.split('\n\n')
    buffer = parts.pop() ?? ''

    for (const part of parts) {
      const parsed = parseSseEvent(part)
      if (parsed) events.push(parsed)
    }
  }

  const trimmedBuffer = buffer.trim()
  if (trimmedBuffer.length > 0) {
    const parsed = parseSseEvent(trimmedBuffer)
    if (parsed) events.push(parsed)
  }

  return events
}

function assertNoError(events: SseEvent[]) {
  for (const event of events) {
    const data = event.data
    if (data && typeof data === 'object' && 'type' in data) {
      const typed = data as { type?: string; error?: { message?: string } }
      if (typed.type === 'error' || typed.type?.includes('error')) {
        const errorMessage =
          typeof typed.error === 'object' && typed.error
            ? String(typed.error.message ?? 'unknown')
            : 'unknown'
        throw new Error(`SSE error: ${errorMessage}`)
      }
    }
  }
}

function findStreamText(events: SseEvent[]): string | undefined {
  for (const event of events) {
    const responseText = extractTextFromUnknown(event.data)
    if (responseText) return responseText
  }

  return undefined
}

function logSseEvents(label: string, events: SseEvent[]) {
  if (!debugSse) return
  const tail = events.slice(-5)
  console.log(`${label} (last ${tail.length} events):`)
  for (const event of tail) {
    const data = event.data
    if (data && typeof data === 'object' && 'type' in data) {
      const typed = data as { type?: string }
      console.log(`- ${event.event ?? 'unknown'}: ${typed.type ?? 'unknown'}`)
    } else {
      console.log(`- ${event.event ?? 'unknown'}`)
    }
  }
}

function extractTextFromUnknown(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : undefined
  }

  if (!value || typeof value !== 'object') return undefined

  const record = value as Record<string, unknown>

  if (typeof record.text === 'string' && record.text.trim().length > 0) {
    return record.text
  }

  if ('response' in record) {
    const fromResponse = extractTextFromUnknown(record.response)
    if (fromResponse) return fromResponse
  }

  if ('output' in record) {
    const fromOutput = extractTextFromUnknown(record.output)
    if (fromOutput) return fromOutput
  }

  return undefined
}

async function main() {
  const { project, version } = await requestJson<ProjectResponse>(
    '/api/v3/projects',
    {
      name: `Gateway Run/Chat Test ${new Date().toISOString()}`,
    },
  )

  await requestJson(
    `/api/v3/projects/${project.id}/versions/${version.uuid}/documents/get-or-create`,
    {
      path: promptPath,
      prompt: promptContent,
    },
  )

  const runSync = await requestJson<RunResponse>(
    `/api/v3/projects/${project.id}/versions/${version.uuid}/documents/run`,
    {
      path: promptPath,
      stream: false,
      parameters: { topic: 'Barcelona weather in winter' },
    },
  )

  if (!runSync.uuid || !runSync.response?.text) {
    throw new Error('Foreground run (non-stream) did not return response text')
  }

  const runStreamEvents = await requestSse(
    `/api/v3/projects/${project.id}/versions/${version.uuid}/documents/run`,
    {
      path: promptPath,
      stream: true,
      parameters: { topic: 'Lisbon weather in spring' },
    },
  )

  if (runStreamEvents.length === 0) {
    throw new Error('Foreground run (stream) returned no SSE events')
  }

  assertNoError(runStreamEvents)

  const runStreamText = findStreamText(runStreamEvents)
  if (!runStreamText) {
    logSseEvents('Run stream debug', runStreamEvents)
    throw new Error('Foreground run (stream) did not return response text')
  }

  const runBackground = await requestJson<RunResponse>(
    `/api/v3/projects/${project.id}/versions/${version.uuid}/documents/run`,
    {
      path: promptPath,
      stream: false,
      background: true,
      parameters: { topic: 'Berlin weather in autumn' },
    },
  )

  if (!runBackground.uuid) {
    throw new Error('Background run did not return UUID')
  }

  const chatSync = await requestJson<RunResponse>(
    `/api/v3/conversations/${runSync.uuid}/chat`,
    {
      stream: false,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Give me a packing tip for this topic.',
            },
          ],
        },
      ],
    },
  )

  if (!chatSync.uuid || !chatSync.response?.text) {
    throw new Error('Chat (non-stream) did not return response text')
  }

  if (chatSync.uuid !== runSync.uuid) {
    throw new Error('Chat (non-stream) UUID does not match run UUID')
  }

  const chatStreamEvents = await requestSse(
    `/api/v3/conversations/${runSync.uuid}/chat`,
    {
      stream: true,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Summarize the advice in five words.',
            },
          ],
        },
      ],
    },
  )

  if (chatStreamEvents.length === 0) {
    throw new Error('Chat (stream) returned no SSE events')
  }

  assertNoError(chatStreamEvents)

  const chatStreamText = findStreamText(chatStreamEvents)
  if (!chatStreamText) {
    logSseEvents('Chat stream debug', chatStreamEvents)
    throw new Error('Chat (stream) did not return response text')
  }

  console.log('Foreground run (non-stream) OK:', runSync.response.text)
  console.log('Foreground run (stream) OK:', runStreamText)
  console.log('Background run OK:', runBackground.uuid)
  console.log('Chat (non-stream) OK:', chatSync.response.text)
  console.log('Chat (stream) OK:', chatStreamText)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
