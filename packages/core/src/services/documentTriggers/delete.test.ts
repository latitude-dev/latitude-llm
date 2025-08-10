import { beforeEach, describe, expect, it, vi } from 'vitest'
import { and, eq } from 'drizzle-orm'
import { DocumentTriggerType } from '@latitude-data/constants'
import { DocumentTrigger, Workspace } from '../../browser'
import { deleteDocumentTrigger } from './delete'
import { documentTriggers } from '../../schema'
import { LatitudeError } from './../../lib/errors'
import { Result } from '../../lib/Result'
import * as pipedreamTriggersModule from './../integrations/pipedream/triggers'

describe('deleteDocumentTrigger', () => {
  let workspace: Workspace
  let emailTrigger: DocumentTrigger
  let integrationTrigger: DocumentTrigger
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
    emailTrigger = {
      id: 11,
      triggerType: DocumentTriggerType.Email,
    } as DocumentTrigger
    integrationTrigger = {
      id: 22,
      triggerType: DocumentTriggerType.Integration,
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

    // Ensure we can control destroyPipedreamTrigger per test
    vi.spyOn(pipedreamTriggersModule, 'destroyPipedreamTrigger').mockReset()
  })

  it('deletes a non-integration trigger successfully', async () => {
    // Arrange
    mockReturning.mockResolvedValue([
      {
        ...emailTrigger,
      } as DocumentTrigger,
    ])

    // Act
    const result = await deleteDocumentTrigger({
      workspace,
      documentTrigger: emailTrigger,
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
        eq(documentTriggers.id, emailTrigger.id),
      ),
    )
    expect(result.value).toEqual(emailTrigger)
    expect(pipedreamTriggersModule.destroyPipedreamTrigger).not.toHaveBeenCalled()
  })

  it('deletes an integration trigger successfully after destroying pipedream trigger', async () => {
    // Arrange
    vi.spyOn(pipedreamTriggersModule, 'destroyPipedreamTrigger').mockResolvedValue(
      Result.ok(undefined),
    )

    mockReturning.mockResolvedValue([
      {
        ...integrationTrigger,
      } as DocumentTrigger,
    ])

    // Act
    const result = await deleteDocumentTrigger({
      workspace,
      documentTrigger: integrationTrigger,
    })

    // Assert
    expect(result.error).toBeUndefined()
    expect(result.value).toBeDefined()
    expect(pipedreamTriggersModule.destroyPipedreamTrigger).toHaveBeenCalledWith({
      workspace,
      documentTrigger: integrationTrigger,
    })
    expect(mockTx.delete).toHaveBeenCalledWith(documentTriggers)
    expect(mockWhere).toHaveBeenCalledWith(
      and(
        eq(documentTriggers.workspaceId, workspace.id),
        eq(documentTriggers.id, integrationTrigger.id),
      ),
    )
    expect(result.value).toEqual(integrationTrigger)
  })

  it('returns an error when document trigger deletion fails', async () => {
    // Arrange
    mockReturning.mockResolvedValue([])

    // Act
    const result = await deleteDocumentTrigger({
      workspace,
      documentTrigger: emailTrigger,
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
        eq(documentTriggers.id, emailTrigger.id),
      ),
    )
  })

  it('returns an error and does not delete when destroying pipedream trigger fails', async () => {
    // Arrange
    vi.spyOn(pipedreamTriggersModule, 'destroyPipedreamTrigger').mockResolvedValue(
      Result.error(new LatitudeError('Failed to destroy integration trigger')),
    )

    // Act
    const result = await deleteDocumentTrigger({
      workspace,
      documentTrigger: integrationTrigger,
    })

    // Assert
    expect(result.ok).toBeFalsy()
    expect(result.error).toBeInstanceOf(LatitudeError)
    expect(pipedreamTriggersModule.destroyPipedreamTrigger).toHaveBeenCalledWith({
      workspace,
      documentTrigger: integrationTrigger,
    })
    expect(mockTx.delete).not.toHaveBeenCalled()
  })
})
