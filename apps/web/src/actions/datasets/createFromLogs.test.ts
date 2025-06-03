import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createDatasetFromLogsAction } from './createFromLogs'
import * as factories from '@latitude-data/core/factories'
import {
  Providers,
  LogSources,
  DocumentLogFilterOptions,
} from '@latitude-data/core/browser'
import { defaultQueue } from '@latitude-data/core/queues'

vi.mock('$/services/auth/getSession', () => ({
  getSession: vi.fn(),
}))
vi.mock('@latitude-data/core/services/datasets/findOrCreate', () => ({
  findOrCreateDataset: vi.fn(),
}))
vi.mock('@latitude-data/core/services/datasets/updateFromLogs', () => ({
  updateDatasetFromLogs: vi.fn(),
}))
vi.mock('@latitude-data/core/queues', () => ({
  defaultQueue: { add: vi.fn() },
}))
vi.mock('@latitude-data/core/events/publisher', () => ({
  publisher: { publishLater: vi.fn() },
}))

const getSession = vi.mocked(
  (await import('$/services/auth/getSession')).getSession,
  true,
)
const findOrCreateDataset = vi.mocked(
  (await import('@latitude-data/core/services/datasets/findOrCreate'))
    .findOrCreateDataset,
  true,
)
const updateDatasetFromLogs = vi.mocked(
  (await import('@latitude-data/core/services/datasets/updateFromLogs'))
    .updateDatasetFromLogs,
  true,
)
const queueAdd = vi.mocked(defaultQueue.add, true)

describe('createDatasetFromLogsAction', () => {
  let user: any
  let workspace: any
  let document: any
  let filterOptions: DocumentLogFilterOptions
  let documentUuid: string
  let projectId: string | number
  let commitUuid: string

  beforeEach(async () => {
    vi.clearAllMocks()

    const projectData = await factories.createProject({
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
    user = projectData.user
    workspace = projectData.workspace
    document = projectData.documents[0]
    documentUuid = document.documentUuid
    projectId = projectData.project.id
    commitUuid = projectData.commit.uuid

    getSession.mockReturnValue(
      Promise.resolve({
        user,
        session: { workspace, document } as any, // Cast to Session type
      }),
    )

    filterOptions = {
      commitIds: [],
      logSources: [LogSources.API],
      createdAt: { from: new Date(), to: new Date() },
      customIdentifier: undefined,
      experimentId: undefined,
    }

    findOrCreateDataset.mockResolvedValue({
      unwrap: () => ({ id: 1, name: 'Test Dataset' }),
    } as any)

    updateDatasetFromLogs.mockResolvedValue({
      unwrap: () => ({ success: true }),
    } as any)
  })

  describe('unauthorized', () => {
    it('returns UnauthorizedError when user is not authenticated', async () => {
      getSession.mockReturnValue(
        Promise.resolve({
          user: null,
          session: null,
        }),
      )

      const [, error] = await createDatasetFromLogsAction({
        name: 'Test Dataset',
        extendedFilterOptions: filterOptions,
        count: 3,
        documentUuid,
        projectId,
        commitUuid,
      })

      expect(error?.name).toBe('UnauthorizedError')
    })
  })

  describe('authorized - sync mode', () => {
    it('processes logs synchronously when count is below batch size', async () => {
      const [result, error] = await createDatasetFromLogsAction({
        name: 'Test Dataset',
        extendedFilterOptions: filterOptions,
        count: 3,
        documentUuid,
        projectId,
        commitUuid,
      })

      expect(error).toBeNull()
      expect(result).toEqual({ mode: 'sync', result: { success: true } })
      expect(findOrCreateDataset).toHaveBeenCalledWith({
        name: 'Test Dataset',
        author: user,
        workspace,
      })
      expect(updateDatasetFromLogs).toHaveBeenCalledWith({
        workspace,
        documentUuid: document.documentUuid,
        dataset: { id: 1, name: 'Test Dataset' },
        extendedFilterOptions: filterOptions,
      })
      expect(queueAdd).not.toHaveBeenCalled()
    })
  })

  describe('authorized - async mode', () => {
    it('processes logs asynchronously when count is above batch size', async () => {
      const [result, error] = await createDatasetFromLogsAction({
        name: 'Test Dataset',
        extendedFilterOptions: filterOptions,
        count: 101,
        documentUuid,
        projectId,
        commitUuid,
      })

      expect(error).toBeNull()
      expect(result).toEqual({ mode: 'async' })
      expect(findOrCreateDataset).not.toHaveBeenCalled()
      expect(updateDatasetFromLogs).not.toHaveBeenCalled()
      expect(queueAdd).toHaveBeenCalledWith('createDatasetFromLogsJob', {
        name: 'Test Dataset',
        author: user,
        workspace,
        documentUuid: document.documentUuid,
        extendedFilterOptions: filterOptions,
      })
    })
  })
})
