import { DocumentTriggerType } from '@latitude-data/constants'
import { and, eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DocumentTrigger, Workspace } from '../../browser'
import { documentTriggers } from '../../schema'
import { LatitudeError } from './../../lib/errors'
import { deleteDocumentTrigger } from './delete'

describe('deleteDocumentTrigger', () => {
  let workspace: Workspace
  let documentTrigger: DocumentTrigger
  let mockTx: any
  let mockDelete: any
  let mockWhere: any
  let mockReturning: any

  const mocks = vi.hoisted(() => ({
    transactionMock: vi.fn(),
  }))

  beforeEach(() => {
    // Setup test data
    workspace = { id: 1 } as Workspace
    documentTrigger = {
      id: 2,
      triggerType: DocumentTriggerType.Email,
      configuration: {
        emailWhitelist: ['test@example.com'],
        replyWithResponse: true,
      },
    } as DocumentTrigger

    // Setup mock transaction and database
    mockReturning = vi.fn()
    mockWhere = vi.fn().mockReturnValue({ returning: mockReturning })
    mockDelete = vi.fn().mockReturnValue({ where: mockWhere })
    mockTx = { delete: mockDelete }
    mocks.transactionMock.prototype.call = vi.fn(
      async (fn: (tx: any) => Promise<any>) => {
        return await fn(mockTx)
      },
    )

    vi.mock('./../../lib/Transaction', async (importOriginal) => ({
      ...(await importOriginal()),
      default: mocks.transactionMock,
    }))
  })

  it('deletes a document trigger successfully', async () => {
    // Arrange
    mockReturning.mockResolvedValue([documentTrigger])

    // Act
    const result = await deleteDocumentTrigger({
      workspace,
      documentTrigger,
    })

    // Assert
    expect(result.error).toBeUndefined()
    expect(result.value).toBeDefined()
    expect(mocks.transactionMock.prototype.call).toHaveBeenCalledWith(
      expect.any(Function),
    )
    expect(mockTx.delete).toHaveBeenCalledWith(documentTriggers)
    expect(mockWhere).toHaveBeenCalledWith(
      and(
        eq(documentTriggers.workspaceId, workspace.id),
        eq(documentTriggers.id, documentTrigger.id),
      ),
    )
    expect(result.value).toEqual(documentTrigger)
  })

  it('returns an error when document trigger deletion fails', async () => {
    // Arrange
    mockReturning.mockResolvedValue([])

    // Act
    const result = await deleteDocumentTrigger({
      workspace,
      documentTrigger,
    })

    // Assert
    expect(result.ok).toBeFalsy()
    expect(result.error).toBeInstanceOf(LatitudeError)
    expect(result.error?.message).toBe('Failed to delete document trigger')
    expect(mocks.transactionMock.prototype.call).toHaveBeenCalledWith(
      expect.any(Function),
    )
    expect(mockTx.delete).toHaveBeenCalledWith(documentTriggers)
    expect(mockWhere).toHaveBeenCalledWith(
      and(
        eq(documentTriggers.workspaceId, workspace.id),
        eq(documentTriggers.id, documentTrigger.id),
      ),
    )
  })
})
