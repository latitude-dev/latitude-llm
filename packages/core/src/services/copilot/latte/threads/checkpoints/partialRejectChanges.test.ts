import { describe, expect, it, vi, beforeEach } from 'vitest'
import { partialRejectLatteChanges } from './partialRejectChanges'
import { LatteThreadsRepository } from '../../../../../repositories'
import { restoreThreadCheckpoint } from './undoChanges'
import Transaction from '../../../../../lib/Transaction'
import { Result } from '../../../../../lib/Result'
import { latteThreadCheckpoints } from '../../../../../schema/models/latteThreadCheckpoints'

vi.mock('./undoChanges', () => ({
  restoreThreadCheckpoint: vi.fn(),
}))

vi.mock('../../../../../repositories', () => ({
  LatteThreadsRepository: vi.fn(),
}))

vi.mock('../../../../../lib/Transaction', () => ({
  default: vi.fn(),
}))

describe('partialDiscardLatteChanges', () => {
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

  it('returns ok([]) when documentUuidsToReject is empty', async () => {
    const result = await partialRejectLatteChanges({
      workspace: mockWorkspace,
      threadUuid: mockThreadUuid,
      documentUuidsToReject: [],
    })

    expect(result).toEqual(Result.ok([]))
    expect(mockTransaction.call).not.toHaveBeenCalled()
  })

  it('returns ok([]) when no checkpoints are found', async () => {
    mockRepository.findCheckpointsByDocument.mockResolvedValue([])

    mockTransaction.call.mockImplementation(async (callback: any) => {
      return callback(mockTransaction)
    })

    const result = await partialRejectLatteChanges({
      workspace: mockWorkspace,
      threadUuid: mockThreadUuid,
      documentUuidsToReject: mockDocumentUuids,
    })

    expect(result).toEqual(Result.ok([]))
    expect(mockRepository.findCheckpointsByDocument).toHaveBeenCalledWith({
      threadUuid: mockThreadUuid,
      documentUuids: mockDocumentUuids,
    })
    expect(mockTransaction.call).toHaveBeenCalled()
  })

  it('successfully restores checkpoints and deletes them', async () => {
    mockRepository.findCheckpointsByDocument.mockResolvedValue(mockCheckpoints)
    ;(restoreThreadCheckpoint as any).mockResolvedValue(Result.ok(undefined))

    mockTransaction.call.mockImplementation(async (callback: any) => {
      return callback(mockTransaction)
    })

    const result = await partialRejectLatteChanges({
      workspace: mockWorkspace,
      threadUuid: mockThreadUuid,
      documentUuidsToReject: mockDocumentUuids,
    })

    expect(result.ok).toBe(true)

    expect(mockRepository.findCheckpointsByDocument).toHaveBeenCalledWith({
      threadUuid: mockThreadUuid,
      documentUuids: mockDocumentUuids,
    })

    expect(restoreThreadCheckpoint).toHaveBeenCalledTimes(2)
    expect(restoreThreadCheckpoint).toHaveBeenCalledWith(
      mockCheckpoints[0],
      mockTransaction,
    )
    expect(restoreThreadCheckpoint).toHaveBeenCalledWith(
      mockCheckpoints[1],
      mockTransaction,
    )

    expect(mockTransaction.delete).toHaveBeenCalledWith(latteThreadCheckpoints)
    expect(mockTransaction.where).toHaveBeenCalled()
  })

  it('throws error when restoreThreadCheckpoint fails', async () => {
    mockRepository.findCheckpointsByDocument.mockResolvedValue(mockCheckpoints)
    ;(restoreThreadCheckpoint as any).mockResolvedValue(
      Result.error(new Error('Restore failed')),
    )

    mockTransaction.call.mockImplementation(async (callback: any) => {
      return callback(mockTransaction)
    })

    await expect(
      partialRejectLatteChanges({
        workspace: mockWorkspace,
        threadUuid: mockThreadUuid,
        documentUuidsToReject: mockDocumentUuids,
      }),
    ).rejects.toThrow('Restore failed')
  })

  it('uses provided transaction', async () => {
    const customTransaction = { call: vi.fn() }
    mockRepository.findCheckpointsByDocument.mockResolvedValue([])

    await partialRejectLatteChanges(
      {
        workspace: mockWorkspace,
        threadUuid: mockThreadUuid,
        documentUuidsToReject: mockDocumentUuids,
      },
      customTransaction as any,
    )

    expect(Transaction).not.toHaveBeenCalled()
    expect(customTransaction.call).toHaveBeenCalled()
  })
})
