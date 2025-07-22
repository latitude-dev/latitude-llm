import { LatitudeTelemetry } from '$telemetry/index'
import { Adapters, Latitude } from '@latitude-data/sdk'
import { setupServer } from 'msw/node'
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
      await latitude.prompts.renderChain({
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
