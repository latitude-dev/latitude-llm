import { BACKGROUND, LatitudeTelemetry } from '$telemetry/index'
import { Latitude } from '@latitude-data/sdk'
import { setupServer } from 'msw/node'
import { Adapters } from 'promptl-ai'
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import * as fixtures from '../fixtures'
import { mockRequest } from '../utils'

vi.hoisted(() => {
  process.env.GATEWAY_HOSTNAME = 'fake-host.com'
  process.env.GATEWAY_PORT = '443'
  process.env.GATEWAY_SSL = 'true'
  process.env.npm_package_name = 'fake-service-name'
  process.env.npm_package_version = 'fake-scope-version'
})

describe('latitude', () => {
  const gatewayMock = setupServer()

  beforeAll(() => {
    gatewayMock.listen()
  })

  afterEach(() => {
    gatewayMock.resetHandlers()
    vi.clearAllMocks()
  })

  afterAll(() => {
    gatewayMock.close()
  })

  it(
    'succeeds when instrumenting latitude runs',
    gatewayMock.boundary(async () => {
      const { bodyMock } = mockRequest({
        server: gatewayMock,
        method: 'post',
        endpoint: '/api/v3/traces',
      })

      const sdk = new LatitudeTelemetry('fake-api-key', {
        instrumentations: {
          latitude: {
            module: Latitude,
            completions: true,
          },
        },
      })

      const step1 = sdk.step(BACKGROUND())
      const trace1 = sdk.pause(step1.context)
      step1.end()
      const { bodyMock: runBodyMock } = mockRequest({
        server: gatewayMock,
        method: 'post',
        endpoint: '/api/v3/projects/1/versions/fake-version-uuid/documents/run',
        response: fixtures.RUN_RESPONSE(trace1),
      })

      const step2 = sdk.step(sdk.resume(trace1))
      const trace2 = sdk.pause(step2.context)
      step2.end()
      const { bodyMock: chat1BodyMock } = mockRequest({
        server: gatewayMock,
        method: 'post',
        endpoint: '/api/v3/conversations/fake-conversation-uuid-1/chat',
        response: fixtures.CHAT_RESPONSES[0]!(trace2),
      })

      const step3 = sdk.step(sdk.resume(trace2))
      const trace3 = sdk.pause(step3.context)
      step3.end()
      const { bodyMock: chat2BodyMock } = mockRequest({
        server: gatewayMock,
        method: 'post',
        endpoint: '/api/v3/conversations/fake-conversation-uuid-2/chat',
        response: fixtures.CHAT_RESPONSES[1]!(trace3),
      })

      const latitude = new Latitude('fake-api-key', { projectId: 1 })

      await latitude.prompts.run('fake-document-path', {
        versionUuid: 'fake-version-uuid',
        customIdentifier: 'fake-custom-identifier',
        parameters: fixtures.PARAMETERS,
        stream: false,
        tools: {
          get_weather: fixtures.TOOL,
        },
      })

      await sdk.shutdown()

      expect(runBodyMock).toHaveBeenCalled()
      expect(chat1BodyMock).toHaveBeenCalledWith(
        expect.objectContaining({ trace: trace1 }),
      )
      expect(chat2BodyMock).toHaveBeenCalledWith(
        expect.objectContaining({ trace: trace2 }),
      )
      expect(bodyMock).toHaveBeenCalledWith(fixtures.LATITUDE_RUN_SPANS)
    }),
  )

  it(
    'succeeds when instrumenting latitude renders',
    gatewayMock.boundary(async () => {
      const { bodyMock } = mockRequest({
        server: gatewayMock,
        method: 'post',
        endpoint: '/api/v3/traces',
      })

      const sdk = new LatitudeTelemetry('fake-api-key', {
        instrumentations: {
          latitude: {
            module: Latitude,
            completions: true,
          },
        },
      })

      const latitude = new Latitude('fake-api-key', { projectId: 1 })

      let step = -1
      await latitude.prompts.renderAgent({
        prompt: fixtures.PROMPT,
        parameters: fixtures.PARAMETERS,
        adapter: Adapters.openai,
        onStep: async () => {
          step += 1
          return fixtures.COMPLETIONS[step] as any
        },
        tools: {
          get_weather: fixtures.TOOL,
        },
        logResponses: false,
      })

      await sdk.shutdown()

      expect(bodyMock).toHaveBeenCalledWith(fixtures.LATITUDE_RENDERING_SPANS)
    }),
  )
})
