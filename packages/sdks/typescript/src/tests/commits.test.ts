import { Latitude } from '$sdk/index'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import {
  mockPushCommitAuthHeader,
  mockPushCommitBody,
  mockPushCommitError,
} from './helpers/commits'

const FAKE_API_KEY = 'fake-api-key'
const projectId = 123
const baseCommitUuid = 'base-commit-uuid'
let sdk: Latitude

const server = setupServer()

describe('commits', () => {
  beforeAll(() => server.listen())
  afterEach(() => server.resetHandlers())
  afterAll(() => server.close())

  beforeAll(() => {
    sdk = new Latitude(FAKE_API_KEY)
  })

  describe('push', () => {
    const testChanges = [
      {
        path: 'test-prompt.md',
        content: 'Hello world',
        status: 'added' as const,
      },
      {
        path: 'existing-prompt.md',
        content: 'Updated content',
        status: 'modified' as const,
        contentHash: 'abc123',
      },
      {
        path: 'deleted-prompt.md',
        content: '',
        status: 'deleted' as const,
      },
    ]

    it(
      'sends auth header',
      server.boundary(async () => {
        const { mockFn } = mockPushCommitAuthHeader({
          server,
          apiVersion: 'v3',
          projectId,
          commitUuid: baseCommitUuid,
        })
        await sdk.versions.push(projectId, baseCommitUuid, testChanges)
        expect(mockFn).toHaveBeenCalledWith('Bearer fake-api-key')
      }),
    )

    it(
      'sends correct request body',
      server.boundary(async () => {
        const { mockBodyFn } = mockPushCommitBody({
          server,
          apiVersion: 'v3',
          projectId,
          commitUuid: baseCommitUuid,
        })
        await sdk.versions.push(projectId, baseCommitUuid, testChanges)
        expect(mockBodyFn).toHaveBeenCalledWith({
          changes: testChanges,
          __internal: { source: 'api' },
        })
      }),
    )

    it(
      'handles response correctly',
      server.boundary(async () => {
        const { mockResponse } = mockPushCommitBody({
          server,
          apiVersion: 'v3',
          projectId,
          commitUuid: baseCommitUuid,
        })
        const response = await sdk.versions.push(
          projectId,
          baseCommitUuid,
          testChanges,
        )
        expect(response).toEqual({
          commitUuid: mockResponse.commitUuid,
        })
      }),
    )

    it(
      'handles different change statuses',
      server.boundary(async () => {
        const mixedChanges = [
          {
            path: 'new-file.md',
            content: 'New content',
            status: 'added' as const,
          },
          {
            path: 'updated-file.md',
            content: 'Modified content',
            status: 'modified' as const,
            contentHash: 'def456',
          },
          {
            path: 'unchanged-file.md',
            content: 'Same content',
            status: 'unchanged' as const,
          },
          {
            path: 'removed-file.md',
            content: '',
            status: 'deleted' as const,
          },
        ]

        const { mockBodyFn } = mockPushCommitBody({
          server,
          apiVersion: 'v3',
          projectId,
          commitUuid: baseCommitUuid,
        })
        await sdk.versions.push(projectId, baseCommitUuid, mixedChanges)
        expect(mockBodyFn).toHaveBeenCalledWith({
          changes: mixedChanges,
          __internal: { source: 'api' },
        })
      }),
    )

    it(
      'handles errors correctly',
      server.boundary(async () => {
        mockPushCommitError({
          server,
          apiVersion: 'v3',
          projectId,
          commitUuid: baseCommitUuid,
        })
        try {
          await sdk.versions.push(projectId, baseCommitUuid, testChanges)
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
