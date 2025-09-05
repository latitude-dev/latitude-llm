import { describe, expect, it, vi, beforeEach } from 'vitest'
import { partialAcceptLatteChanges } from './partialAcceptChanges'
import { LatteThreadsRepository } from '../../../../../repositories'
import Transaction from '../../../../../lib/Transaction'
import { latteThreadCheckpoints } from '../../../../../schema'

vi.mock('../../../../../repositories', () => ({
  LatteThreadsRepository: vi.fn(),
}))

vi.mock('../../../../../lib/Transaction', () => ({
  default: vi.fn(),
}))

describe('partialAcceptLatteChanges', () => {
  const mockWorkspace = { id: 1 } as any
  const mockThreadUuid = 'test-thread-uuid'
  const mockDocumentUuids = ['doc-1', 'doc-2']

  const mockCheckpoints = [
    { id: 1, threadUuid: mockThreadUuid, documentUuid: 'doc-1' },
    { id: 2, threadUuid: mockThreadUuid, documentUuid: 'doc-2' },
  ]

  let mockTransaction: any
  let mockRepository: any

  beforeEach(() => {
    vi.clearAllMocks()

    mockTransaction = {
      call: vi.fn(),
      delete: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue(undefined),
    }
    ;(Transaction as any).mockImplementation(() => mockTransaction)

    mockRepository = {
      findCheckpointsByDocument: vi.fn(),
    }
    ;(LatteThreadsRepository as any).mockImplementation(() => mockRepository)
  })

  it('returns ok([]) when documentUuidsToAccept is empty', async () => {
    const result = await partialAcceptLatteChanges({
      workspace: mockWorkspace,
      threadUuid: mockThreadUuid,
      documentUuidsToAccept: [],
    })

    expect(result.ok).toBe(true)
    expect(result.value).toEqual([])
    expect(mockTransaction.call).not.toHaveBeenCalled()
  })

  it('returns ok([]) when no checkpoints are found', async () => {
    mockRepository.findCheckpointsByDocument.mockResolvedValue([])

    const result = await partialAcceptLatteChanges({
      workspace: mockWorkspace,
      threadUuid: mockThreadUuid,
      documentUuidsToAccept: mockDocumentUuids,
    })

    expect(result.ok).toBe(true)
    expect(result.value).toEqual([])
    expect(mockRepository.findCheckpointsByDocument).toHaveBeenCalledWith({
      threadUuid: mockThreadUuid,
      documentUuids: mockDocumentUuids,
    })
    expect(mockTransaction.call).not.toHaveBeenCalled()
  })

  it('successfully deletes checkpoints', async () => {
    mockRepository.findCheckpointsByDocument.mockResolvedValue(mockCheckpoints)

    mockTransaction.call.mockImplementation(async (callback: any) => {
      return callback(mockTransaction)
    })

    const result = await partialAcceptLatteChanges({
      workspace: mockWorkspace,
      threadUuid: mockThreadUuid,
      documentUuidsToAccept: mockDocumentUuids,
    })

    expect(result.ok).toBe(true)

    expect(mockRepository.findCheckpointsByDocument).toHaveBeenCalledWith({
      threadUuid: mockThreadUuid,
      documentUuids: mockDocumentUuids,
    })

    expect(mockTransaction.call).toHaveBeenCalled()
    expect(mockTransaction.delete).toHaveBeenCalledWith(latteThreadCheckpoints)
    expect(mockTransaction.where).toHaveBeenCalled()
  })

  it('uses provided transaction', async () => {
    const customTransaction = {
      call: vi.fn().mockImplementation(async (callback: any) => {
        return callback(customTransaction)
      }),
      delete: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue(undefined),
    }
    mockRepository.findCheckpointsByDocument.mockResolvedValue(mockCheckpoints)

    await partialAcceptLatteChanges(
      {
        workspace: mockWorkspace,
        threadUuid: mockThreadUuid,
        documentUuidsToAccept: mockDocumentUuids,
      },
      customTransaction as any,
    )

    expect(Transaction).not.toHaveBeenCalled()
    expect(customTransaction.call).toHaveBeenCalled()
  })
})
