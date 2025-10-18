import { Latitude } from '$sdk/index'
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

import {
  mockGetAllProjectsRequest,
  mockGetAllProjectsResponse,
  mockCreateProjectRequest,
  mockCreateProjectResponse,
  mockProjectsError,
} from './helpers/projects'

const FAKE_API_KEY = 'fake-api-key'
let sdk: Latitude

const server = setupServer()

describe('projects', () => {
  beforeAll(() => server.listen())
  afterEach(() => server.resetHandlers())
  afterAll(() => server.close())

  beforeAll(() => {
    vi.clearAllMocks()
    sdk = new Latitude(FAKE_API_KEY)
  })

  describe('getAll', () => {
    it(
      'sends auth header',
      server.boundary(async () => {
        const { mockAuthHeader } = mockGetAllProjectsRequest({
          server,
          apiVersion: 'v3',
        })
        await sdk.projects.getAll()
        expect(mockAuthHeader).toHaveBeenCalledWith('Bearer fake-api-key')
      }),
    )

    it(
      'handles response correctly',
      server.boundary(async () => {
        const { mockResponse, mockFn } = mockGetAllProjectsResponse({
          server,
          apiVersion: 'v3',
        })
        const response = await sdk.projects.getAll()
        expect(response).toEqual(mockResponse)
        expect(mockFn).toHaveBeenCalledTimes(1)
      }),
    )

    it(
      'handles errors correctly',
      server.boundary(async () => {
        mockProjectsError({
          server,
          apiVersion: 'v3',
          method: 'GET',
        })
        try {
          await sdk.projects.getAll()
        } catch (error) {
          // @ts-expect-error - mock error
          expect(error.message).toEqual(
            'Unexpected API Error: 500 Something went wrong',
          )
        }
      }),
    )
  })

  describe('create', () => {
    it(
      'sends auth header',
      server.boundary(async () => {
        const { mockAuthHeader } = mockCreateProjectRequest({
          server,
          apiVersion: 'v3',
        })
        await sdk.projects.create('Test Project')
        expect(mockAuthHeader).toHaveBeenCalledWith('Bearer fake-api-key')
      }),
    )

    it(
      'sends correct request body',
      server.boundary(async () => {
        const projectName = 'Test Project'
        const { mockBody } = mockCreateProjectRequest({
          server,
          apiVersion: 'v3',
        })
        await sdk.projects.create(projectName)
        expect(mockBody).toHaveBeenCalledWith(
          expect.objectContaining({ name: projectName }),
        )
      }),
    )

    it(
      'handles response correctly',
      server.boundary(async () => {
        const projectName = 'Test Project'
        const { mockResponse, mockFn } = mockCreateProjectResponse({
          server,
          apiVersion: 'v3',
          projectName,
        })
        const response = await sdk.projects.create(projectName)
        expect(response).toEqual(mockResponse)
        expect(mockFn).toHaveBeenCalledTimes(1)
      }),
    )

    it(
      'handles errors correctly',
      server.boundary(async () => {
        mockProjectsError({
          server,
          apiVersion: 'v3',
          method: 'POST',
        })
        try {
          await sdk.projects.create('Test Project')
        } catch (error) {
          // @ts-expect-error - mock error
          expect(error.message).toEqual(
            'Unexpected API Error: 500 Something went wrong',
          )
        }
      }),
    )
  })
})
