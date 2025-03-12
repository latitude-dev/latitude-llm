import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DocumentTriggerType } from '@latitude-data/constants'
import { DocumentTrigger, Workspace } from '../../browser'
import { deleteDocumentTrigger } from './delete'
import { LatitudeError, Result, Transaction } from '../../lib'
import { database } from '../../client'
import { documentTriggers } from '../../schema'
import { and, eq } from 'drizzle-orm'

describe('deleteDocumentTrigger', () => {
  let workspace: Workspace
  let documentTrigger: DocumentTrigger
  let mockDb: typeof database
  let mockTx: any
  let mockDelete: any
  let mockWhere: any
  let mockReturning: any

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
    mockDb = {} as typeof database

    // Mock the Transaction.call function
    vi.spyOn(Transaction, 'call').mockImplementation(
      async (fn: (tx: any) => Promise<any>) => {
        return await fn(mockTx)
      },
    )
  })

  it('deletes a document trigger successfully', async () => {
    // Arrange
    mockReturning.mockResolvedValue([documentTrigger])

    // Act
    const result = await deleteDocumentTrigger(
      {
        workspace,
        documentTrigger,
      },
      mockDb,
    )

    // Assert
    expect(result.error).toBeUndefined()
    expect(result.value).toBeDefined()
    expect(Transaction.call).toHaveBeenCalledWith(expect.any(Function), mockDb)
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
    const result = await deleteDocumentTrigger(
      {
        workspace,
        documentTrigger,
      },
      mockDb,
    )

    // Assert
    expect(result.ok).toBeFalsy()
    expect(result.error).toBeInstanceOf(LatitudeError)
    expect(result.error?.message).toBe('Failed to delete document trigger')
    expect(Transaction.call).toHaveBeenCalledWith(expect.any(Function), mockDb)
    expect(mockTx.delete).toHaveBeenCalledWith(documentTriggers)
    expect(mockWhere).toHaveBeenCalledWith(
      and(
        eq(documentTriggers.workspaceId, workspace.id),
        eq(documentTriggers.id, documentTrigger.id),
      ),
    )
  })

  it('uses a custom database instance if provided', async () => {
    // Arrange
    mockReturning.mockResolvedValue([documentTrigger])
    const customDb = { customDb: true } as unknown as typeof database

    // Act
    const result = await deleteDocumentTrigger(
      {
        workspace,
        documentTrigger,
      },
      customDb,
    )

    // Assert
    expect(result.error).toBeUndefined()
    expect(result.value).toBeDefined()
    expect(Transaction.call).toHaveBeenCalledWith(
      expect.any(Function),
      customDb,
    )
  })
})
