import { describe, it, expect, vi } from 'vitest'
import { evaluateLiveLogJob } from './evaluateLiveLog'
import { DocumentLogsRepository } from '../../repositories'
import { DocumentLogCreatedEvent } from '../events'
import * as dataAccess from '../../data-access'
import { NotFoundError } from '@latitude-data/constants/errors'

const findWorkspaceFromDocumentLog = vi.spyOn(
  dataAccess,
  'findWorkspaceFromDocumentLog',
)

vi.mock('../../repositories', () => ({
  DocumentLogsRepository: vi.fn(),
  CommitsRepository: vi.fn(),
  EvaluationsV2Repository: vi.fn(),
}))

describe('evaluateLiveLogJob', () => {
  it('should throw NotFoundError if document log is not found', async () => {
    const mockFind = vi.fn().mockResolvedValue({
      unwrap: () => {
        throw new NotFoundError('miau')
      },
    })
    // @ts-ignore
    vi.mocked(DocumentLogsRepository).mockImplementation(() => ({
      find: mockFind,
    }))

    const event: DocumentLogCreatedEvent = {
      type: 'documentLogCreated',
      data: {
        id: 1,
        workspaceId: 1,
      },
    }

    expect(await evaluateLiveLogJob({ data: event })).toThrow()

    expect(mockFind).toHaveBeenCalledWith(1)
    expect(mockFind).toHaveBeenCalledTimes(1)
    expect(findWorkspaceFromDocumentLog).not.toHaveBeenCalled()
  })
})
