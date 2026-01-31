import { Latitude } from '$sdk/index'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import {
  mockGetVersionAuthHeader,
  mockGetVersionBody,
  mockGetAllVersionsAuthHeader,
  mockGetAllVersionsBody,
  mockCreateVersionAuthHeader,
  mockCreateVersionBody,
  mockVersionsError,
} from './helpers/versions'

const FAKE_API_KEY = 'fake-api-key'
const projectId = 123
const versionUuid = 'test-version-uuid'
let sdk: Latitude

const server = setupServer()

describe('versions', () => {
  beforeAll(() => server.listen())
  afterEach(() => server.resetHandlers())
  afterAll(() => server.close())

  beforeAll(() => {
    sdk = new Latitude(FAKE_API_KEY)
  })

  describe('get', () => {
    it(
      'sends auth header',
      server.boundary(async () => {
        const { mockFn } = mockGetVersionAuthHeader({
          server,
          apiVersion: 'v3',
          projectId,
          versionUuid,
        })
        await sdk.versions.get(projectId, versionUuid)
        expect(mockFn).toHaveBeenCalledWith('Bearer fake-api-key')
      }),
    )

    it(
      'handles response correctly',
      server.boundary(async () => {
        const { mockResponse } = mockGetVersionBody({
          server,
          apiVersion: 'v3',
          projectId,
          versionUuid,
        })
        const response = await sdk.versions.get(projectId, versionUuid)
        expect(response).toEqual(mockResponse)
      }),
    )

    it(
      'handles errors correctly',
      server.boundary(async () => {
        mockVersionsError({
          server,
          apiVersion: 'v3',
          projectId,
          versionUuid,
          method: 'GET',
        })
        try {
          await sdk.versions.get(projectId, versionUuid)
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
        const { mockFn } = mockCreateVersionAuthHeader({
          server,
          apiVersion: 'v3',
          projectId,
        })
        await sdk.versions.create('Test Version', { projectId })
        expect(mockFn).toHaveBeenCalledWith('Bearer fake-api-key')
      }),
    )

    it(
      'sends correct request body',
      server.boundary(async () => {
        const versionName = 'Test Version'
        const { mockBodyFn } = mockCreateVersionBody({
          server,
          apiVersion: 'v3',
          projectId,
          versionName,
        })
        await sdk.versions.create(versionName, { projectId })
        expect(mockBodyFn).toHaveBeenCalledWith(
          expect.objectContaining({ name: versionName }),
        )
      }),
    )

    it(
      'handles response correctly',
      server.boundary(async () => {
        const versionName = 'Test Version'
        const { mockResponse } = mockCreateVersionBody({
          server,
          apiVersion: 'v3',
          projectId,
          versionName,
        })
        const response = await sdk.versions.create(versionName, { projectId })
        expect(response).toEqual(mockResponse)
      }),
    )

    it(
      'uses default projectId from SDK options',
      server.boundary(async () => {
        const sdkWithProject = new Latitude(FAKE_API_KEY, { projectId })
        const versionName = 'Test Version'
        const { mockBodyFn } = mockCreateVersionBody({
          server,
          apiVersion: 'v3',
          projectId,
          versionName,
        })
        await sdkWithProject.versions.create(versionName)
        expect(mockBodyFn).toHaveBeenCalledWith(
          expect.objectContaining({ name: versionName }),
        )
      }),
    )

    it(
      'throws error when no projectId provided',
      server.boundary(async () => {
        try {
          await sdk.versions.create('Test Version')
        } catch (error) {
          // @ts-expect-error - mock error
          expect(error.message).toEqual('Project ID is required')
        }
      }),
    )

    it(
      'handles errors correctly',
      server.boundary(async () => {
        mockVersionsError({
          server,
          apiVersion: 'v3',
          projectId,
          method: 'POST',
        })
        try {
          await sdk.versions.create('Test Version', { projectId })
        } catch (error) {
          // @ts-expect-error - mock error
          expect(error.message).toEqual(
            'Unexpected API Error: 500 Something went wrong',
          )
        }
      }),
    )
  })

  describe('getAll', () => {
    it(
      'sends auth header',
      server.boundary(async () => {
        const { mockFn } = mockGetAllVersionsAuthHeader({
          server,
          apiVersion: 'v3',
          projectId,
        })
        await sdk.versions.getAll(projectId)
        expect(mockFn).toHaveBeenCalledWith('Bearer fake-api-key')
      }),
    )

    it(
      'handles response correctly',
      server.boundary(async () => {
        const { mockResponse } = mockGetAllVersionsBody({
          server,
          apiVersion: 'v3',
          projectId,
        })
        const response = await sdk.versions.getAll(projectId)
        expect(response).toEqual(mockResponse)
      }),
    )

    it(
      'uses default projectId from SDK options',
      server.boundary(async () => {
        const sdkWithProject = new Latitude(FAKE_API_KEY, { projectId })
        const { mockResponse } = mockGetAllVersionsBody({
          server,
          apiVersion: 'v3',
          projectId,
        })
        const response = await sdkWithProject.versions.getAll()
        expect(response).toEqual(mockResponse)
      }),
    )

    it(
      'throws error when no projectId provided',
      server.boundary(async () => {
        try {
          await sdk.versions.getAll()
        } catch (error) {
          // @ts-expect-error - mock error
          expect(error.message).toEqual('Project ID is required')
        }
      }),
    )

    it(
      'handles errors correctly',
      server.boundary(async () => {
        mockVersionsError({
          server,
          apiVersion: 'v3',
          projectId,
          method: 'GET',
        })
        try {
          await sdk.versions.getAll(projectId)
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
