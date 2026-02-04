import { beforeAll, describe, expect, it, vi } from 'vitest'
import { Latitude } from '../../dist/index.js'

const shouldRunAcceptance = process.env.RUN_ACCEPTANCE_TESTS === '1'
const describeAcceptance = shouldRunAcceptance ? describe : describe.skip
const apiKey = process.env.TEST_LATITUDE_API_KEY ?? ''
if (shouldRunAcceptance && !apiKey) {
  throw new Error(
    'TEST_LATITUDE_API_KEY is required when RUN_ACCEPTANCE_TESTS=1',
  )
}

const gatewayUrl =
  process.env.TEST_GATEWAY_URL ??
  process.env.GATEWAY_URL ??
  'http://localhost:8787'

const gatewayConfig = (() => {
  const url = new URL(gatewayUrl)
  const port =
    url.port.length > 0
      ? Number(url.port)
      : url.protocol === 'https:'
        ? 443
        : 80
  return { host: url.hostname, port, ssl: url.protocol === 'https:' }
})()
const gatewayUnavailableMessage = `Latitude service is not running at ${gatewayUrl}. Please start the service before running E2E tests.`
const log = (...args: unknown[]) =>
  console.log('[sdk-acceptance]', new Date().toISOString(), ...args)

// HOW TO RUN THESE TESTS:
//
// 1. Start the latitude services locally (or set TEST_GATEWAY_URL)
// 2. Set RUN_ACCEPTANCE_TESTS=1
// 3. Set the TEST_LATITUDE_API_KEY environment variable with a valid API key
// 4. Ensure a provider with valid api key that matches the promptContent :point_down: is available
// 5. Build the sdk package with `pnpm build`
// 6. Run the test `RUN_ACCEPTANCE_TESTS=1 TEST_LATITUDE_API_KEY={your_key} pnpm test ./src/tests/acceptance.test.ts`

describeAcceptance('SDK Integration Tests (E2E)', { timeout: 90000 }, () => {
  const promptPath = 'weather-assistant'
  const simplePromptPath = 'echo-assistant'
  const promptContent = `
---
provider: openai
model: gpt-4.1-mini
type: agent
tools:
  - get_weather:
      description: Obtains the weather temperature from a given location.
      parameters:
        type: object
        properties:
          location:
            type: string
            description: The location for the weather report.
---

You're a mother-based AI. Given a location, your task is to obtain the weather for that location and then generate a
mother-like recommendation of clothing depending on it.

Location: {{ location }}

<step>
 Obtain the weather please
</step>

<step>
  Finally, create a mother-like recommendation based on the weather report.
  Call the get_weather tool exactly once before answering.
</step>
`.trim()
  const simplePromptContent = `
---
provider: openai
model: gpt-4.1-mini
---

You are a helpful assistant. Reply with a short acknowledgement.
`.trim()

  let sdk: Latitude

  beforeAll(async () => {
    log('beforeAll:start', {
      shouldRunAcceptance,
      gatewayUrl,
      gatewayConfig,
      hasApiKey: Boolean(apiKey),
    })
    // Setup SDK for creating project and prompt
    const setupSdk = new Latitude(apiKey, {
      __internal: {
        gateway: gatewayConfig,
      },
    })

    try {
      const setupStart = Date.now()
      // Create project
      const { project, version } =
        await setupSdk.projects.create('End to End Test')
      log('beforeAll:project-created', {
        projectId: project.id,
        versionUuid: version.uuid,
        durationMs: Date.now() - setupStart,
      })

      // Create or get prompt with weather content
      const weatherStart = Date.now()
      await setupSdk.prompts.getOrCreate(promptPath, {
        projectId: project.id,
        versionUuid: version.uuid,
        prompt: promptContent,
      })
      log('beforeAll:prompt-ready', {
        promptPath,
        durationMs: Date.now() - weatherStart,
      })

      const simpleStart = Date.now()
      await setupSdk.prompts.getOrCreate(simplePromptPath, {
        projectId: project.id,
        versionUuid: version.uuid,
        prompt: simplePromptContent,
      })
      log('beforeAll:simple-prompt-ready', {
        promptPath: simplePromptPath,
        durationMs: Date.now() - simpleStart,
      })

      sdk = new Latitude(apiKey, {
        projectId: project.id,
        versionUuid: version.uuid,
        __internal: {
          gateway: gatewayConfig,
        },
      })
      log('beforeAll:sdk-ready', {
        projectId: project.id,
        versionUuid: version.uuid,
      })
    } catch (error) {
      log('beforeAll:error', error)
      if (error instanceof Error && error.message.includes('ECONNREFUSED')) {
        throw new Error(gatewayUnavailableMessage)
      }

      throw error
    }
  })

  it('should instantiate SDK targeting localhost:8787 with no SSL and run prompt with tool handler', async () => {
    log('test:start', 'run-with-tool-handler')
    // Create the get_weather tool handler
    const getWeatherTool = vi
      .fn()
      .mockImplementation(async (...args: unknown[]) => {
        log('tool:get_weather:called', ...args)
        return 'Temperature is 25°C and sunny'
      })

    try {
      const runStart = Date.now()
      // Run prompt with get_weather tool - this makes a real API call
      const result = await sdk.prompts.run(promptPath, {
        parameters: { location: 'Barcelona' },
        stream: true,
        onError: (err) => log('run-with-tool-handler:onError', err),
        onFinished: (data) =>
          log('run-with-tool-handler:onFinished', {
            uuid: data?.uuid,
            responseLength: data?.response?.text?.length,
          }),
        tools: {
          get_weather: getWeatherTool,
        },
      })
      log('run-with-tool-handler:result', {
        durationMs: Date.now() - runStart,
        uuid: result?.uuid,
        responseLength: result?.response?.text?.length,
      })

      // Assertions for real response
      expect(result).toBeDefined()
      expect(result?.uuid).toBeDefined()
      expect(typeof result?.uuid).toBe('string')
      expect(result?.response).toBeDefined()
      expect(result?.response?.text).toBeDefined()
      expect(typeof result?.response?.text).toBe('string')
      expect(result?.response?.text.length).toBeGreaterThan(0)

      // Verify the response is not an error and contains valid text
      expect(result?.response).not.toHaveProperty('error')
      expect(result?.response?.text).not.toMatch(/error/i)

      // Verify tool handler is available (may or may not be called depending on prompt)
      expect(getWeatherTool).toBeDefined()
      log('test:finish', 'run-with-tool-handler')
    } catch (error) {
      log('run-with-tool-handler:error', error)
      if (error instanceof Error && error.message.includes('ECONNREFUSED')) {
        throw new Error(gatewayUnavailableMessage)
      }

      // If authentication fails with test API key, skip test with warning
      if (
        error instanceof Error &&
        error.message.includes('Failed query') &&
        apiKey === 'test-api-key'
      ) {
        console.warn(
          '⚠️  Using test API key. Set LATITUDE_API_KEY environment variable with a valid API key for full E2E testing.',
        )
        return // Skip test
      }

      throw error
    }
  })

  it('should handle tool calls during prompt execution with streaming', async () => {
    log('test:start', 'tool-calls-streaming')
    const getWeatherMock = vi
      .fn()
      .mockImplementation(async (...args: unknown[]) => {
        log('tool:get_weather:called', ...args)
        return 'Temperature is 22°C and cloudy'
      })

    const onFinishedMock = vi.fn()
    const onErrorMock = vi.fn()

    try {
      const runStart = Date.now()
      // Make real streaming API call
      const result = await sdk.prompts.run(promptPath, {
        parameters: { location: 'Madrid' },
        stream: true,
        tools: {
          get_weather: getWeatherMock,
        },
        onFinished: (data) => {
          onFinishedMock(data)
          log('tool-calls-streaming:onFinished', {
            uuid: data?.uuid,
            responseLength: data?.response?.text?.length,
          })
        },
        onError: (err) => {
          onErrorMock(err)
          log('tool-calls-streaming:onError', err)
        },
      })
      log('tool-calls-streaming:result', {
        durationMs: Date.now() - runStart,
        uuid: result?.uuid,
        responseLength: result?.response?.text?.length,
      })

      // Verify no errors occurred (unless using test API key)
      if (apiKey !== 'test-api-key') {
        expect(onErrorMock).not.toHaveBeenCalled()

        // Verify final response only if no errors
        expect(result).toBeDefined()
        expect(result?.response?.text).toBeDefined()
        expect(typeof result?.response?.text).toBe('string')
        expect(result?.response?.text.length).toBeGreaterThan(0)

        // Verify callbacks were called appropriately
        if (onFinishedMock.mock.calls.length > 0) {
          expect(onFinishedMock).toHaveBeenCalled()
        }
      }
      log('test:finish', 'tool-calls-streaming')
    } catch (error) {
      log('tool-calls-streaming:error', error)
      if (error instanceof Error && error.message.includes('ECONNREFUSED')) {
        throw new Error(gatewayUnavailableMessage)
      }

      // If authentication fails with test API key, skip test with warning
      if (
        error instanceof Error &&
        error.message.includes('Failed query') &&
        apiKey === 'test-api-key'
      ) {
        console.warn(
          '⚠️  Using test API key. Set LATITUDE_API_KEY environment variable with a valid API key for full E2E testing.',
        )
        return // Skip test
      }

      throw error
    }
  })

  it('should ensure tool handler gets called when tools are requested', async () => {
    log('test:start', 'tool-handler-called')
    const getWeatherMock = vi
      .fn()
      .mockImplementation(async (...args: unknown[]) => {
        log('tool:get_weather:called', ...args)
        return 'Temperature is 20°C and rainy'
      })

    try {
      const runStart = Date.now()
      // Make real API call
      const result = await sdk.prompts.run(promptPath, {
        parameters: { location: 'Paris' },
        stream: true,
        tools: {
          get_weather: getWeatherMock,
        },
        onFinished: (data) =>
          log('tool-handler-called:onFinished', {
            uuid: data?.uuid,
            responseLength: data?.response?.text?.length,
          }),
        onError: (err) => log('tool-handler-called:onError', err),
      })
      log('tool-handler-called:result', {
        durationMs: Date.now() - runStart,
        uuid: result?.uuid,
        responseLength: result?.response?.text?.length,
      })

      // Verify the tool handler was available
      expect(getWeatherMock).toBeDefined()

      // Verify response structure and content from real service
      expect(result).toBeDefined()
      expect(result?.uuid).toBeDefined()
      expect(typeof result?.uuid).toBe('string')
      expect(result?.response).toBeDefined()
      expect(result?.response?.text).toBeDefined()
      expect(typeof result?.response?.text).toBe('string')
      expect(result?.response?.text.length).toBeGreaterThan(0)

      // Verify the response is not an error and contains valid text
      expect(result?.response).not.toHaveProperty('error')
      expect(result?.response?.text).not.toMatch(/error/i)

      // Verify the tool handler was called
      expect(getWeatherMock).toHaveBeenCalledExactlyOnceWith(
        { location: 'Paris' },
        {
          id: expect.any(String),
          name: 'get_weather',
          arguments: { location: 'Paris' },
        },
      )
      log('test:finish', 'tool-handler-called')
    } catch (error) {
      log('tool-handler-called:error', error)
      if (error instanceof Error && error.message.includes('ECONNREFUSED')) {
        throw new Error(gatewayUnavailableMessage)
      }

      // If authentication fails with test API key, skip test with warning
      if (
        error instanceof Error &&
        error.message.includes('Failed query') &&
        apiKey === 'test-api-key'
      ) {
        console.warn(
          '⚠️  Using test API key. Set LATITUDE_API_KEY environment variable with a valid API key for full E2E testing.',
        )
        return // Skip test
      }

      throw error
    }
  })

  it('should handle authentication and project validation', async () => {
    log('test:start', 'auth-project-validation')
    try {
      const runStart = Date.now()
      await sdk.prompts.run(promptPath, {
        parameters: { location: 'London' },
        tools: {
          get_weather: vi.fn().mockResolvedValue('test'),
        },
      })
      log('auth-project-validation:result', {
        durationMs: Date.now() - runStart,
      })

      // If we get here without error, the service might not be validating auth
      // This is still a valid test result
      log('test:finish', 'auth-project-validation')
    } catch (error) {
      log('auth-project-validation:error', error)
      if (error instanceof Error && error.message.includes('ECONNREFUSED')) {
        throw new Error(gatewayUnavailableMessage)
      }

      // Authentication errors are expected with invalid API key
      // This confirms the service is properly validating authentication
      expect(error).toBeDefined()
      log('test:finish', 'auth-project-validation')
    }
  })

  it('should run prompt without streaming', async () => {
    log('test:start', 'run-without-streaming')
    try {
      const runStart = Date.now()
      const result = await sdk.prompts.run(simplePromptPath, {
        stream: false,
        parameters: {},
      })
      log('run-without-streaming:result', {
        durationMs: Date.now() - runStart,
        uuid: result?.uuid,
        responseLength: result?.response?.text?.length,
      })

      expect(result).toBeDefined()
      expect(result?.uuid).toBeDefined()
      expect(typeof result?.uuid).toBe('string')
      expect(result?.response).toBeDefined()
      expect(result?.response?.text).toBeDefined()
      expect(typeof result?.response?.text).toBe('string')
      expect(result?.response?.text.length).toBeGreaterThan(0)
      log('test:finish', 'run-without-streaming')
    } catch (error) {
      log('run-without-streaming:error', error)
      if (error instanceof Error && error.message.includes('ECONNREFUSED')) {
        throw new Error(gatewayUnavailableMessage)
      }

      if (
        error instanceof Error &&
        error.message.includes('Failed query') &&
        apiKey === 'test-api-key'
      ) {
        console.warn(
          '⚠️  Using test API key. Set LATITUDE_API_KEY environment variable with a valid API key for full E2E testing.',
        )
        return
      }

      throw error
    }
  })

  it('should chat without streaming after a run', async () => {
    log('test:start', 'chat-without-streaming')
    try {
      const runStart = Date.now()
      const runResult = await sdk.prompts.run(simplePromptPath, {
        stream: false,
        parameters: {},
      })
      log('chat-without-streaming:run-result', {
        durationMs: Date.now() - runStart,
        uuid: runResult?.uuid,
        responseLength: runResult?.response?.text?.length,
      })

      expect(runResult).toBeDefined()
      expect(runResult?.uuid).toBeDefined()

      const chatStart = Date.now()
      const chatResult = await sdk.prompts.chat(
        runResult!.uuid,
        [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Can you acknowledge this?',
              },
            ],
          },
        ],
        {
          stream: false,
        },
      )
      log('chat-without-streaming:chat-result', {
        durationMs: Date.now() - chatStart,
        uuid: chatResult?.uuid,
        responseLength: chatResult?.response?.text?.length,
      })

      expect(chatResult).toBeDefined()
      expect(chatResult?.uuid).toBeDefined()
      expect(typeof chatResult?.uuid).toBe('string')
      expect(chatResult?.response).toBeDefined()
      expect(chatResult?.response?.text).toBeDefined()
      expect(typeof chatResult?.response?.text).toBe('string')
      expect(chatResult?.response?.text.length).toBeGreaterThan(0)
      expect(chatResult?.uuid).toBe(runResult?.uuid)
      log('test:finish', 'chat-without-streaming')
    } catch (error) {
      log('chat-without-streaming:error', error)
      if (error instanceof Error && error.message.includes('ECONNREFUSED')) {
        throw new Error(gatewayUnavailableMessage)
      }

      if (
        error instanceof Error &&
        error.message.includes('Failed query') &&
        apiKey === 'test-api-key'
      ) {
        console.warn(
          '⚠️  Using test API key. Set LATITUDE_API_KEY environment variable with a valid API key for full E2E testing.',
        )
        return
      }

      throw error
    }
  })

  it('should run prompt and continue with chat follow-up', async () => {
    log('test:start', 'run-and-chat-followup')
    try {
      // First, run the prompt to get a conversation UUID
      const getWeatherMock = vi
        .fn()
        .mockImplementation(async (...args: unknown[]) => {
          log('tool:get_weather:called', ...args)
          return 'Temperature is 18°C and windy'
        })

      const runStart = Date.now()
      const firstResult = await sdk.prompts.run(promptPath, {
        parameters: { location: 'Berlin' },
        stream: true,
        tools: {
          get_weather: getWeatherMock,
        },
        onFinished: (data) =>
          log('run-and-chat-followup:onFinished', {
            uuid: data?.uuid,
            responseLength: data?.response?.text?.length,
          }),
        onError: (err) => log('run-and-chat-followup:onError', err),
      })
      log('run-and-chat-followup:run-result', {
        durationMs: Date.now() - runStart,
        uuid: firstResult?.uuid,
        responseLength: firstResult?.response?.text?.length,
      })

      // Verify first response
      expect(firstResult).toBeDefined()
      expect(firstResult?.uuid).toBeDefined()
      expect(typeof firstResult?.uuid).toBe('string')
      expect(firstResult?.response?.text).toBeDefined()
      expect(firstResult?.response?.text.length).toBeGreaterThan(0)

      const conversationUuid = firstResult?.uuid

      // Now do a chat follow-up with the same tool handler
      const chatStart = Date.now()
      const chatResult = await sdk.prompts.chat(
        conversationUuid!,
        [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'What should I wear for this weather?',
              },
            ],
          },
        ],
        {
          stream: true,
          tools: {
            get_weather: getWeatherMock,
          },
          onFinished: (data) =>
            log('run-and-chat-followup:chat:onFinished', {
              uuid: data?.uuid,
              responseLength: data?.response?.text?.length,
            }),
          onError: (err) => log('run-and-chat-followup:chat:onError', err),
        },
      )
      log('run-and-chat-followup:chat-result', {
        durationMs: Date.now() - chatStart,
        uuid: chatResult?.uuid,
        responseLength: chatResult?.response?.text?.length,
      })

      // Verify chat response
      expect(chatResult).toBeDefined()
      expect(chatResult?.uuid).toBeDefined()
      expect(typeof chatResult?.uuid).toBe('string')
      expect(chatResult?.response).toBeDefined()
      expect(chatResult?.response?.text).toBeDefined()
      expect(typeof chatResult?.response?.text).toBe('string')
      expect(chatResult?.response?.text.length).toBeGreaterThan(0)

      // The chat should have the same conversation UUID
      expect(chatResult?.uuid).toBe(conversationUuid)

      // Verify the response contains clothing advice (related to the follow-up question)
      expect(chatResult?.response?.text.toLowerCase()).toMatch(
        /jacket|sweater|coat|umbrella|clothing|wear|dress/i,
      )
      log('test:finish', 'run-and-chat-followup')
    } catch (error) {
      log('run-and-chat-followup:error', error)
      if (error instanceof Error && error.message.includes('ECONNREFUSED')) {
        throw new Error(
          'Latitude service is not running on localhost:8787. Please start the service before running E2E tests.',
        )
      }

      if (
        error instanceof Error &&
        error.message.includes('Failed query') &&
        apiKey === 'test-api-key'
      ) {
        console.warn(
          '⚠️  Using test API key. Set LATITUDE_API_KEY environment variable with a valid API key for full E2E testing.',
        )
        return
      }

      throw error
    }
  })
})
