import { Latitude } from '$sdk/index'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import { mock500Error, mockAuthHeader, mockDeleteBody } from './helpers/delete'

const FAKE_API_KEY = 'fake-api-key'
const projectId = 123
let sdk: Latitude

const server = setupServer()

describe('/delete', () => {
  beforeAll(() => server.listen())
  afterEach(() => server.resetHandlers())
  afterAll(() => server.close())

  beforeAll(() => {
    sdk = new Latitude(FAKE_API_KEY)
  })

  it(
    'sends auth header',
    server.boundary(async () => {
      const { docPath, mockFn } = mockAuthHeader({
        server,
        apiVersion: 'v3',
        docPath: 'fake-document-id',
      })
      await sdk.prompts.delete(docPath, { projectId })
      expect(mockFn).toHaveBeenCalledWith('Bearer fake-api-key')
    }),
  )

  it(
    'handles response correctly',
    server.boundary(async () => {
      const { docPath, mockResponse } = mockDeleteBody({
        server,
        apiVersion: 'v3',
        version: 'live',
        docPath: 'fake-document-id',
      })
      const response = await sdk.prompts.delete(docPath, { projectId })
      expect(response).toEqual(mockResponse)
    }),
  )

  it(
    'handles errors correctly',
    server.boundary(async () => {
      const { docPath } = mock500Error({
        server,
        apiVersion: 'v3',
        docPath: 'fake-document-id',
      })
      try {
        await sdk.prompts.delete(docPath, { projectId })
      } catch (error) {
        // @ts-expect-error - mock error
        expect(error.message).toEqual(
          'Unexpected API Error: 500 Something went wrong',
        )
      }
    }),
  )

  it('targets correct version uuid if one is provided', async () => {
    const { docPath, version, mockResponse } = mockDeleteBody({
      server,
      apiVersion: 'v3',
      version: 'fake-version-uuid',
      docPath: 'fake-document-id',
    })
    const response = await sdk.prompts.delete(docPath, {
      projectId,
      versionUuid: version,
    })
    expect(response).toEqual(mockResponse)
  })
})
