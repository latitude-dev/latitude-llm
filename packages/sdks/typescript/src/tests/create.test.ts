import { Latitude } from '$sdk/index'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import {
  mockCreatePromptAuthHeader,
  mockCreatePromptBody,
  mockCreatePromptError,
} from './helpers/prompts'

const FAKE_API_KEY = 'fake-api-key'
const projectId = 123
const promptPath = 'test-prompt'
let sdk: Latitude

const server = setupServer()

describe('prompts.create', () => {
  beforeAll(() => server.listen())
  afterEach(() => server.resetHandlers())
  afterAll(() => server.close())

  beforeAll(() => {
    sdk = new Latitude(FAKE_API_KEY)
  })

  it(
    'sends auth header',
    server.boundary(async () => {
      const { mockFn } = mockCreatePromptAuthHeader({
        server,
        apiVersion: 'v3',
        projectId,
      })
      await sdk.prompts.create(promptPath, { projectId })
      expect(mockFn).toHaveBeenCalledWith('Bearer fake-api-key')
    }),
  )

  it(
    'sends correct request body',
    server.boundary(async () => {
      const promptContent = 'Hello {{name}}'
      const { mockBodyFn } = mockCreatePromptBody({
        server,
        apiVersion: 'v3',
        projectId,
        promptPath,
      })
      await sdk.prompts.create(promptPath, {
        projectId,
        prompt: promptContent,
      })
      expect(mockBodyFn).toHaveBeenCalledWith({
        path: promptPath,
        prompt: promptContent,
        __internal: {
          source: 'api',
        },
      })
    }),
  )

  it(
    'handles response correctly',
    server.boundary(async () => {
      const { mockResponse } = mockCreatePromptBody({
        server,
        apiVersion: 'v3',
        projectId,
        promptPath,
      })
      const response = await sdk.prompts.create(promptPath, { projectId })
      expect(response).toEqual(mockResponse)
    }),
  )

  it(
    'uses default projectId from SDK options',
    server.boundary(async () => {
      const sdkWithProject = new Latitude(FAKE_API_KEY, { projectId })
      const { mockBodyFn } = mockCreatePromptBody({
        server,
        apiVersion: 'v3',
        projectId,
        promptPath,
      })
      await sdkWithProject.prompts.create(promptPath)
      expect(mockBodyFn).toHaveBeenCalledWith({
        path: promptPath,
        __internal: {
          source: 'api',
        },
      })
    }),
  )

  it(
    'uses custom versionUuid when provided',
    server.boundary(async () => {
      const customVersionUuid = 'custom-version-uuid'
      const { mockBodyFn } = mockCreatePromptBody({
        server,
        apiVersion: 'v3',
        projectId,
        versionUuid: customVersionUuid,
        promptPath,
      })
      await sdk.prompts.create(promptPath, {
        projectId,
        versionUuid: customVersionUuid,
      })
      expect(mockBodyFn).toHaveBeenCalledWith({
        path: promptPath,
        __internal: {
          source: 'api',
        },
      })
    }),
  )

  it(
    'uses default versionUuid from SDK options',
    server.boundary(async () => {
      const defaultVersionUuid = 'default-version-uuid'
      const sdkWithVersion = new Latitude(FAKE_API_KEY, {
        projectId,
        versionUuid: defaultVersionUuid,
      })
      const { mockBodyFn } = mockCreatePromptBody({
        server,
        apiVersion: 'v3',
        projectId,
        versionUuid: defaultVersionUuid,
        promptPath,
      })
      await sdkWithVersion.prompts.create(promptPath)
      expect(mockBodyFn).toHaveBeenCalledWith({
        path: promptPath,
        __internal: {
          source: 'api',
        },
      })
    }),
  )

  it(
    'throws error when no projectId provided',
    server.boundary(async () => {
      try {
        await sdk.prompts.create(promptPath)
      } catch (error) {
        // @ts-expect-error - mock error
        expect(error.message).toEqual('Project ID is required')
      }
    }),
  )

  it(
    'handles errors correctly',
    server.boundary(async () => {
      mockCreatePromptError({
        server,
        apiVersion: 'v3',
        projectId,
      })
      try {
        await sdk.prompts.create(promptPath, { projectId })
      } catch (error) {
        // @ts-expect-error - mock error
        expect(error.message).toEqual(
          'Unexpected API Error: 500 Something went wrong',
        )
      }
    }),
  )
})
