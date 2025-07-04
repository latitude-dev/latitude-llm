import { BACKGROUND, LatitudeTelemetry } from '$telemetry/index'
import { Latitude } from '@latitude-data/sdk'
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
      expect(bodyMock).toHaveBeenCalledWith(fixtures.LATITUDE_RUN_SPANS)
    }),
  )
})
