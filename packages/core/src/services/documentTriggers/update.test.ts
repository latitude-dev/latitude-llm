import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DocumentTriggerType } from '@latitude-data/constants'
import { DocumentTrigger, Workspace } from '../../browser'
import { updateDocumentTriggerConfiguration } from './update'
import { database } from '../../client'
import * as buildConfigurationModule from './helpers/buildConfiguration'
import { documentTriggers } from '../../schema'
import { EmailTriggerConfiguration } from './helpers/schema'
import { and, eq } from 'drizzle-orm'
import { LatitudeError } from './../../lib/errors'
import Transaction from './../../lib/Transaction'

describe('updateDocumentTriggerConfiguration', () => {
  let workspace: Workspace
  let documentTrigger: DocumentTrigger
  let mockDb: typeof database
  let mockTx: any
  let mockUpdate: any
  let mockSet: any
  let mockWhere: any
  let mockReturning: any

  beforeEach(() => {
    // Setup test data
    workspace = { id: 1 } as Workspace
    documentTrigger = {
      id: 2,
      triggerType: DocumentTriggerType.Email,
      configuration: {
        emailWhitelist: ['old@example.com'],
        replyWithResponse: false,
      },
    } as DocumentTrigger

    // Setup mock transaction and database
    mockReturning = vi.fn()
    mockWhere = vi.fn().mockReturnValue({ returning: mockReturning })
    mockSet = vi.fn().mockReturnValue({ where: mockWhere })
    mockUpdate = vi.fn().mockReturnValue({ set: mockSet })
    mockTx = { update: mockUpdate }
    mockDb = {} as typeof database

    // Mock the Transaction.call function
    vi.spyOn(Transaction, 'call').mockImplementation(
      async (fn: (tx: any) => Promise<any>) => {
        return await fn(mockTx)
      },
    )

    // Mock the buildConfiguration function
    vi.spyOn(buildConfigurationModule, 'buildConfiguration').mockImplementation(
      ({ triggerType, configuration }) => {
        if (triggerType === DocumentTriggerType.Email) {
          return configuration as EmailTriggerConfiguration
        } else {
          return {
            cronExpression: (configuration as any).cronExpression,
            lastRun: new Date('2023-01-01'),
            nextRunTime: new Date('2023-01-02'),
          }
        }
      },
    )
  })

  it('updates an email document trigger configuration successfully', async () => {
    // Arrange
    const newEmailConfiguration: EmailTriggerConfiguration = {
      emailWhitelist: ['test@example.com'],
      replyWithResponse: true,
    }

    mockReturning.mockResolvedValue([
      {
        ...documentTrigger,
        configuration: newEmailConfiguration,
      } as DocumentTrigger,
    ])

    // Act
    const result = await updateDocumentTriggerConfiguration(
      {
        workspace,
        documentTrigger,
        configuration: newEmailConfiguration,
      },
      mockDb,
    )

    // Assert
    expect(result.error).toBeUndefined()
    expect(result.value).toBeDefined()
    expect(Transaction.call).toHaveBeenCalledWith(expect.any(Function), mockDb)
    expect(mockTx.update).toHaveBeenCalledWith(documentTriggers)
    expect(mockSet).toHaveBeenCalledWith({
      configuration: newEmailConfiguration,
    })
    expect(mockWhere).toHaveBeenCalledWith(
      and(
        eq(documentTriggers.workspaceId, workspace.id),
        eq(documentTriggers.id, documentTrigger.id),
      ),
    )
    expect(buildConfigurationModule.buildConfiguration).toHaveBeenCalledWith({
      triggerType: documentTrigger.triggerType,
      configuration: newEmailConfiguration,
    })
    expect(result.value).toEqual({
      ...documentTrigger,
      configuration: newEmailConfiguration,
    })
  })

  it('updates a scheduled document trigger configuration successfully', async () => {
    // Arrange
    const scheduledTrigger = {
      ...documentTrigger,
      triggerType: DocumentTriggerType.Scheduled,
      configuration: {
        cronExpression: '0 0 * * *',
        lastRun: new Date('2022-01-01'),
        nextRunTime: new Date('2022-01-02'),
      },
    } as DocumentTrigger

    // Use any to bypass type checking for this test case
    const newScheduledConfiguration: any = {
      cronExpression: '0 12 * * *',
    }

    const expectedConfiguration = {
      cronExpression: '0 12 * * *',
      lastRun: new Date('2023-01-01'),
      nextRunTime: new Date('2023-01-02'),
    }

    mockReturning.mockResolvedValue([
      {
        ...scheduledTrigger,
        configuration: expectedConfiguration,
      } as DocumentTrigger,
    ])

    // Act
    const result = await updateDocumentTriggerConfiguration(
      {
        workspace,
        documentTrigger: scheduledTrigger,
        configuration: newScheduledConfiguration,
      },
      mockDb,
    )

    // Assert
    expect(result.error).toBeUndefined()
    expect(result.value).toBeDefined()
    expect(Transaction.call).toHaveBeenCalledWith(expect.any(Function), mockDb)
    expect(mockTx.update).toHaveBeenCalledWith(documentTriggers)
    expect(mockSet).toHaveBeenCalledWith({
      configuration: expectedConfiguration,
    })
    expect(mockWhere).toHaveBeenCalledWith(
      and(
        eq(documentTriggers.workspaceId, workspace.id),
        eq(documentTriggers.id, scheduledTrigger.id),
      ),
    )
    expect(buildConfigurationModule.buildConfiguration).toHaveBeenCalledWith({
      triggerType: scheduledTrigger.triggerType,
      configuration: newScheduledConfiguration,
    })
    expect(result.value).toEqual({
      ...scheduledTrigger,
      configuration: expectedConfiguration,
    })
  })

  it('returns an error when document trigger update fails', async () => {
    // Arrange
    const newEmailConfiguration: EmailTriggerConfiguration = {
      emailWhitelist: ['test@example.com'],
      replyWithResponse: true,
    }

    mockReturning.mockResolvedValue([])

    // Act
    const result = await updateDocumentTriggerConfiguration(
      {
        workspace,
        documentTrigger,
        configuration: newEmailConfiguration,
      },
      mockDb,
    )

    // Assert
    expect(result.ok).toBeFalsy()
    expect(result.error).toBeInstanceOf(LatitudeError)
    expect(result.error?.message).toBe(
      'Failed to update document trigger configuration',
    )
    expect(Transaction.call).toHaveBeenCalledWith(expect.any(Function), mockDb)
    expect(mockTx.update).toHaveBeenCalledWith(documentTriggers)
    expect(mockSet).toHaveBeenCalledWith({
      configuration: newEmailConfiguration,
    })
    expect(mockWhere).toHaveBeenCalledWith(
      and(
        eq(documentTriggers.workspaceId, workspace.id),
        eq(documentTriggers.id, documentTrigger.id),
      ),
    )
  })

  it('uses a custom database instance if provided', async () => {
    // Arrange
    const newEmailConfiguration: EmailTriggerConfiguration = {
      emailWhitelist: ['test@example.com'],
      replyWithResponse: true,
    }

    mockReturning.mockResolvedValue([
      {
        ...documentTrigger,
        configuration: newEmailConfiguration,
      } as DocumentTrigger,
    ])

    const customDb = { customDb: true } as unknown as typeof database

    // Act
    const result = await updateDocumentTriggerConfiguration(
      {
        workspace,
        documentTrigger,
        configuration: newEmailConfiguration,
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
