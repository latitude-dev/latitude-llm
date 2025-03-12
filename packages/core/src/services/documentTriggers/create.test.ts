import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DocumentTriggerType, DocumentVersion } from '@latitude-data/constants'
import { DocumentTrigger, Project, Workspace } from '../../browser'
import { createDocumentTrigger } from './create'
import { LatitudeError, Result, Transaction } from '../../lib'
import { database } from '../../client'
import * as buildConfigurationModule from './helpers/buildConfiguration'
import { documentTriggers } from '../../schema'
import {
  EmailTriggerConfiguration,
  InsertScheduledTriggerConfiguration,
} from './helpers/schema'

describe('createDocumentTrigger', () => {
  let workspace: Workspace
  let project: Project
  let document: DocumentVersion
  let mockDb: typeof database
  let mockTx: any
  let mockInsert: any
  let mockValues: any
  let mockReturning: any

  beforeEach(() => {
    // Setup test data
    workspace = { id: 1 } as Workspace
    project = { id: 2 } as Project
    document = { documentUuid: 'test-doc-uuid' } as DocumentVersion

    // Setup mock transaction and database
    mockReturning = vi.fn()
    mockValues = vi.fn().mockReturnValue({ returning: mockReturning })
    mockInsert = vi.fn().mockReturnValue({ values: mockValues })
    mockTx = { insert: mockInsert }
    mockDb = {} as typeof database

    // Mock the Transaction.call function
    vi.spyOn(Transaction, 'call').mockImplementation(
      async (fn: (tx: any) => Promise<any>) => {
        return await fn(mockTx)
      },
    )

    // Mock the generateUUIDIdentifier function by importing and mocking it
    vi.mock('../../lib', async (importOriginal) => {
      const original = await importOriginal<typeof import('../../lib')>()
      return {
        ...original,
        generateUUIDIdentifier: vi.fn().mockReturnValue('mocked-uuid'),
      }
    })

    // Mock the buildConfiguration function
    vi.spyOn(buildConfigurationModule, 'buildConfiguration').mockImplementation(
      ({ triggerType, configuration }) => {
        if (triggerType === DocumentTriggerType.Email) {
          return configuration as EmailTriggerConfiguration
        } else {
          return {
            ...configuration,
            lastRun: new Date('2023-01-01'),
            nextRunTime: new Date('2023-01-02'),
          }
        }
      },
    )
  })

  it('creates an email document trigger successfully', async () => {
    // Arrange
    const emailConfiguration: EmailTriggerConfiguration = {
      emailWhitelist: ['test@example.com'],
      replyWithResponse: true,
    }

    mockReturning.mockResolvedValue([
      {
        uuid: 'mocked-uuid',
        workspaceId: workspace.id,
        documentUuid: document.documentUuid,
        projectId: project.id,
        triggerType: DocumentTriggerType.Email,
        configuration: emailConfiguration,
      } as DocumentTrigger,
    ])

    // Act
    const result = await createDocumentTrigger(
      {
        workspace,
        document,
        project,
        triggerType: DocumentTriggerType.Email,
        configuration: emailConfiguration,
      },
      mockDb,
    )

    // Assert
    expect(result.error).toBeUndefined()
    expect(result.value).toBeDefined()
    expect(Transaction.call).toHaveBeenCalledWith(expect.any(Function), mockDb)
    expect(mockTx.insert).toHaveBeenCalledWith(documentTriggers)
    expect(mockValues).toHaveBeenCalledWith({
      uuid: 'mocked-uuid',
      workspaceId: workspace.id,
      documentUuid: document.documentUuid,
      projectId: project.id,
      triggerType: DocumentTriggerType.Email,
      configuration: emailConfiguration,
    })
    expect(buildConfigurationModule.buildConfiguration).toHaveBeenCalledWith({
      triggerType: DocumentTriggerType.Email,
      configuration: emailConfiguration,
    })
    expect(result.value).toEqual({
      uuid: 'mocked-uuid',
      workspaceId: workspace.id,
      documentUuid: document.documentUuid,
      projectId: project.id,
      triggerType: DocumentTriggerType.Email,
      configuration: emailConfiguration,
    })
  })

  it('creates a scheduled document trigger successfully', async () => {
    // Arrange
    const scheduledConfiguration: InsertScheduledTriggerConfiguration = {
      cronExpression: '0 0 * * *',
    }

    const expectedConfiguration = {
      ...scheduledConfiguration,
      lastRun: new Date('2023-01-01'),
      nextRunTime: new Date('2023-01-02'),
    }

    mockReturning.mockResolvedValue([
      {
        uuid: 'mocked-uuid',
        workspaceId: workspace.id,
        documentUuid: document.documentUuid,
        projectId: project.id,
        triggerType: DocumentTriggerType.Scheduled,
        configuration: expectedConfiguration,
      } as DocumentTrigger,
    ])

    // Act
    const result = await createDocumentTrigger(
      {
        workspace,
        document,
        project,
        triggerType: DocumentTriggerType.Scheduled,
        configuration: scheduledConfiguration,
      },
      mockDb,
    )

    // Assert
    expect(result.error).toBeUndefined()
    expect(result.value).toBeDefined()
    expect(Transaction.call).toHaveBeenCalledWith(expect.any(Function), mockDb)
    expect(mockTx.insert).toHaveBeenCalledWith(documentTriggers)
    expect(mockValues).toHaveBeenCalledWith({
      uuid: 'mocked-uuid',
      workspaceId: workspace.id,
      documentUuid: document.documentUuid,
      projectId: project.id,
      triggerType: DocumentTriggerType.Scheduled,
      configuration: expectedConfiguration,
    })
    expect(buildConfigurationModule.buildConfiguration).toHaveBeenCalledWith({
      triggerType: DocumentTriggerType.Scheduled,
      configuration: scheduledConfiguration,
    })
    expect(result.value).toEqual({
      uuid: 'mocked-uuid',
      workspaceId: workspace.id,
      documentUuid: document.documentUuid,
      projectId: project.id,
      triggerType: DocumentTriggerType.Scheduled,
      configuration: expectedConfiguration,
    })
  })

  it('returns an error when document trigger creation fails', async () => {
    // Arrange
    const emailConfiguration: EmailTriggerConfiguration = {
      emailWhitelist: ['test@example.com'],
      replyWithResponse: true,
    }

    mockReturning.mockResolvedValue([])

    // Act
    const result = await createDocumentTrigger(
      {
        workspace,
        document,
        project,
        triggerType: DocumentTriggerType.Email,
        configuration: emailConfiguration,
      },
      mockDb,
    )

    // Assert
    expect(result.ok).toBeFalsy()
    expect(result.error).toBeInstanceOf(LatitudeError)
    expect(result.error?.message).toBe('Failed to create document trigger')
    expect(Transaction.call).toHaveBeenCalledWith(expect.any(Function), mockDb)
    expect(mockTx.insert).toHaveBeenCalledWith(documentTriggers)
    expect(mockValues).toHaveBeenCalledWith({
      uuid: 'mocked-uuid',
      workspaceId: workspace.id,
      documentUuid: document.documentUuid,
      projectId: project.id,
      triggerType: DocumentTriggerType.Email,
      configuration: emailConfiguration,
    })
  })

  it('uses a custom database instance if provided', async () => {
    // Arrange
    const emailConfiguration: EmailTriggerConfiguration = {
      emailWhitelist: ['test@example.com'],
      replyWithResponse: true,
    }

    mockReturning.mockResolvedValue([
      {
        uuid: 'mocked-uuid',
        workspaceId: workspace.id,
        documentUuid: document.documentUuid,
        projectId: project.id,
        triggerType: DocumentTriggerType.Email,
        configuration: emailConfiguration,
      } as DocumentTrigger,
    ])

    const customDb = { customDb: true } as unknown as typeof database

    // Act
    const result = await createDocumentTrigger(
      {
        workspace,
        document,
        project,
        triggerType: DocumentTriggerType.Email,
        configuration: emailConfiguration,
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
