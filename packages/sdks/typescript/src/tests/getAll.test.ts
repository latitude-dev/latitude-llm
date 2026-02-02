import { Latitude } from '$sdk/index'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import { mock500Error, mockAuthHeader, mockGetBody } from './helpers/getAll'

const FAKE_API_KEY = 'fake-api-key'
const projectId = 123
let sdk: Latitude

const server = setupServer()

describe('/getAll', () => {
  beforeAll(() => server.listen())
  afterEach(() => server.resetHandlers())
  afterAll(() => server.close())

  beforeAll(() => {
    sdk = new Latitude(FAKE_API_KEY)
  })

  it(
    'sends auth header',
    server.boundary(async () => {
      const { mockFn } = mockAuthHeader({
        server,
        apiVersion: 'v3',
      })
      await sdk.prompts.getAll({ projectId })
      expect(mockFn).toHaveBeenCalledWith('Bearer fake-api-key')
    }),
  )

  it(
    'handles response correctly',
    server.boundary(async () => {
      const { mockResponse } = mockGetBody({
        server,
        apiVersion: 'v3',
        version: 'live',
      })
      const response = await sdk.prompts.getAll({ projectId })
      expect(response).toEqual(mockResponse)
    }),
  )

  it(
    'handles errors correctly',
    server.boundary(async () => {
      mock500Error({
        server,
        apiVersion: 'v3',
        docPath: 'fake-document-id',
      })
      try {
        await sdk.prompts.getAll({ projectId })
      } catch (error) {
        // @ts-expect-error - mock error
        expect(error.message).toEqual(
          'Unexpected API Error: 500 Something went wrong',
        )
      }
    }),
  )

  it('target correct version uuid if one is provided', async () => {
    const { version, mockResponse } = mockGetBody({
      server,
      apiVersion: 'v3',
      version: 'fake-version-uuid',
    })
    const response = await sdk.prompts.getAll({
      projectId,
      versionUuid: version,
    })
    expect(response).toEqual(mockResponse)
  })
})
