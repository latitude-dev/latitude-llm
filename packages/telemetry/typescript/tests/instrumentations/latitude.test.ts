import { LatitudeTelemetry } from '$telemetry/index'
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
  process.env.GATEWAY_BASE_URL = 'https://fake-host.com'
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

  // TODO(tracing): succeeds when instrumenting latitude runs

  it(
    'succeeds when instrumenting latitude renders',
    gatewayMock.boundary(async () => {
      const { bodyMock } = mockRequest({
        server: gatewayMock,
        method: 'post',
        endpoint: '/api/v3/otlp/v1/traces',
      })

      const sdk = new LatitudeTelemetry('fake-api-key', {
        instrumentations: {
          latitude: {
            module: Latitude,
            completions: true,
          },
        },
      })

      const latitude = new Latitude('fake-api-key')

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
