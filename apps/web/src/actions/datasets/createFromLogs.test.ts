import * as factories from '@latitude-data/core/factories'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createDatasetFromLogsAction } from './createFromLogs'
import {
  DocumentLogFilterOptions,
  LogSources,
} from '@latitude-data/core/constants'
import { Providers } from '@latitude-data/constants'

// Mock dependencies
const mocks = vi.hoisted(() => {
  return {
    getSession: vi.fn(),
    findOrCreateDataset: vi.fn(),
    updateDatasetFromLogs: vi.fn(),
    defaultQueueAddMock: vi.fn(),
  }
})

vi.mock('$/services/auth/getSession', () => ({
  getSession: mocks.getSession,
}))

vi.mock('@latitude-data/core/services/datasets/findOrCreate', () => ({
  findOrCreateDataset: mocks.findOrCreateDataset,
}))

vi.mock('@latitude-data/core/services/datasets/createFromLogs', () => ({
  updateDatasetFromLogs: mocks.updateDatasetFromLogs,
}))

vi.mock('@latitude-data/core/queues', () => ({
  queues: vi.fn().mockResolvedValue({
    defaultQueue: {
      add: mocks.defaultQueueAddMock,
    },
  }),
}))

vi.mock('@latitude-data/core/events/publisher', () => ({
  publisher: {
    publishLater: vi.fn(),
  },
}))

describe('createDatasetFromLogsAction', () => {
  let user: any
  let workspace: any
  let document: any
  let project: any
  let commit: any
  let filterOptions: DocumentLogFilterOptions

  beforeEach(async () => {
    vi.clearAllMocks()
    // Create test data
    const {
      workspace: ws,
      user: usr,
      project: p,
      commit: c,
      documents: docs,
    } = await factories.createProject({
      providers: [
        {
          type: Providers.OpenAI,
          name: 'openai',
        },
      ],
      documents: {
        doc: factories.helpers.createPrompt({
          provider: 'openai',
        }),
      },
    })
    user = usr
    workspace = ws
    document = docs[0]
    project = p
    commit = c

    // Mock authentication
    mocks.getSession.mockResolvedValue({
      user,
      session: { userId: user.id, currentWorkspaceId: workspace.id },
    })

    // Default filter options based on the actual schema from constants.ts
    filterOptions = {
      commitIds: [],
      logSources: [LogSources.API],
      createdAt: { from: new Date(), to: new Date() },
      customIdentifier: undefined,
      experimentId: undefined,
    }

    // Setup successful responses for mocked functions
    mocks.findOrCreateDataset.mockImplementation(() =>
      Promise.resolve({
        unwrap: () => ({ id: 1, name: 'Test Dataset' }),
      }),
    )

    mocks.updateDatasetFromLogs.mockImplementation(() =>
      Promise.resolve({
        unwrap: () => ({ success: true }),
      }),
    )
  })

  describe('unauthorized', () => {
    it('errors when the user is not authenticated', async () => {
      // Setup unauthorized session
      mocks.getSession.mockResolvedValue(null)

      const [_, error] = await createDatasetFromLogsAction({
        projectId: project.id,
        commitUuid: commit.uuid,
        documentUuid: document.documentUuid,
        name: 'Test Dataset',
        selectionMode: 'PARTIAL',
        selectedDocumentLogIds: [1, 2, 3],
        excludedDocumentLogIds: [],
        filterOptions,
      })

      expect(error!.name).toEqual('UnauthorizedError')
    })
  })

  describe('authorized - sync mode', () => {
    it('processes logs synchronously when in PARTIAL mode with fewer logs than the batch limit', async () => {
      const selectedDocumentLogIds = [1, 2, 3]

      const [result, error] = await createDatasetFromLogsAction({
        projectId: project.id,
        commitUuid: commit.uuid,
        documentUuid: document.documentUuid,
        name: 'Test Dataset',
        selectionMode: 'PARTIAL',
        selectedDocumentLogIds,
        excludedDocumentLogIds: [],
        filterOptions,
      })

      expect(error).toBeNull()
      expect(result).toEqual({ mode: 'sync', result: { success: true } })

      // Verify findOrCreateDataset was called with correct params
      expect(mocks.findOrCreateDataset).toHaveBeenCalledWith({
        name: 'Test Dataset',
        author: user,
        workspace,
      })

      // Verify updateDatasetFromLogs was called with correct params
      expect(mocks.updateDatasetFromLogs).toHaveBeenCalledWith({
        dataset: { id: 1, name: 'Test Dataset' },
        workspace,
        documentLogIds: selectedDocumentLogIds,
      })

      // Verify queue was not used
      expect(mocks.defaultQueueAddMock).not.toHaveBeenCalled()
    })
  })

  describe('authorized - async mode', () => {
    it('processes logs asynchronously when in PARTIAL mode with more logs than the batch limit', async () => {
      // Create an array with more IDs than the batch limit
      const manyIds = Array.from({ length: 30 }, (_, i) => i + 1)

      const [result, error] = await createDatasetFromLogsAction({
        projectId: project.id,
        commitUuid: commit.uuid,
        documentUuid: document.documentUuid,
        name: 'Test Dataset',
        selectionMode: 'PARTIAL',
        selectedDocumentLogIds: manyIds,
        excludedDocumentLogIds: [],
        filterOptions,
      })

      expect(error).toBeNull()
      expect(result).toEqual({ mode: 'async' })

      // Verify findOrCreateDataset was not called
      expect(mocks.findOrCreateDataset).not.toHaveBeenCalled()

      // Verify updateDatasetFromLogs was not called
      expect(mocks.updateDatasetFromLogs).not.toHaveBeenCalled()

      // Verify queue was used with correct params
      expect(mocks.defaultQueueAddMock).toHaveBeenCalledWith(
        'createDatasetFromLogsJob',
        {
          name: 'Test Dataset',
          userId: user.id,
          workspaceId: workspace.id,
          documentVersionId: document.id,
          selectionMode: 'PARTIAL',
          selectedDocumentLogIds: manyIds,
          excludedDocumentLogIds: [],
          filterOptions,
        },
      )
    })

    it('processes logs asynchronously when in ALL mode', async () => {
      const [result, error] = await createDatasetFromLogsAction({
        projectId: project.id,
        commitUuid: commit.uuid,
        documentUuid: document.documentUuid,
        name: 'Test Dataset',
        selectionMode: 'ALL',
        selectedDocumentLogIds: [],
        excludedDocumentLogIds: [],
        filterOptions,
      })

      expect(error).toBeNull()
      expect(result).toEqual({ mode: 'async' })

      // Verify queue was used with correct params
      expect(mocks.defaultQueueAddMock).toHaveBeenCalledWith(
        'createDatasetFromLogsJob',
        {
          name: 'Test Dataset',
          userId: user.id,
          workspaceId: workspace.id,
          documentVersionId: document.id,
          selectionMode: 'ALL',
          selectedDocumentLogIds: [],
          excludedDocumentLogIds: [],
          filterOptions,
        },
      )
    })

    it('processes logs asynchronously when in ALL_EXCEPT mode', async () => {
      const [result, error] = await createDatasetFromLogsAction({
        projectId: project.id,
        commitUuid: commit.uuid,
        documentUuid: document.documentUuid,
        name: 'Test Dataset',
        selectionMode: 'ALL_EXCEPT',
        selectedDocumentLogIds: [],
        excludedDocumentLogIds: [1, 2],
        filterOptions,
      })

      expect(error).toBeNull()
      expect(result).toEqual({ mode: 'async' })

      // Verify queue was used with correct params
      expect(mocks.defaultQueueAddMock).toHaveBeenCalledWith(
        'createDatasetFromLogsJob',
        {
          name: 'Test Dataset',
          userId: user.id,
          workspaceId: workspace.id,
          documentVersionId: document.id,
          selectionMode: 'ALL_EXCEPT',
          selectedDocumentLogIds: [],
          excludedDocumentLogIds: [1, 2],
          filterOptions,
        },
      )
    })
  })
})
