import {
  DocumentLogFilterOptions,
  LogSources,
  Providers,
} from '@latitude-data/core/browser'
import * as factories from '@latitude-data/core/factories'
import { defaultQueue } from '@latitude-data/core/queues'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createDatasetFromLogsAction } from './createFromLogs'

// Mock dependencies
const mocks = vi.hoisted(() => {
  return {
    getSession: vi.fn(),
    findOrCreateDataset: vi.fn(),
    updateDatasetFromLogs: vi.fn(),
    queueAdd: vi.fn(),
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
  defaultQueue: {
    add: vi.fn(),
  },
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
    // Reset mocks
    vi.resetAllMocks()

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
    mocks.getSession.mockReturnValue({
      user,
      workspace,
      document,
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
      mocks.getSession.mockReturnValue(null)

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
    it('processes logs synchronously when in fewer logs than the batch limit', async () => {
      const selectedDocumentLogIds = [1, 2, 3]

      const [result, error] = await createDatasetFromLogsAction({
        projectId: project.id,
        commitUuid: commit.uuid,
        documentUuid: document.documentUuid,
        name: 'Test Dataset',
        selectionMode: 'ALL',
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
      expect(defaultQueue.add).not.toHaveBeenCalled()
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
      expect(defaultQueue.add).toHaveBeenCalledWith(
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
      expect(defaultQueue.add).toHaveBeenCalledWith(
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
      expect(defaultQueue.add).toHaveBeenCalledWith(
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
