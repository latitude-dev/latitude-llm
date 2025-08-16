import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DocumentTriggerType, DocumentVersion } from '@latitude-data/constants'
import { DocumentTrigger, Project, Workspace } from '../../browser'
import { updateDocumentTriggerConfiguration } from './update'
import * as buildConfigurationModule from './helpers/buildConfiguration'
import { documentTriggers } from '../../schema'
import {
  EmailTriggerConfiguration,
  InsertIntegrationTriggerConfiguration,
  InsertScheduledTriggerConfiguration,
  IntegrationTriggerConfiguration,
  ScheduledTriggerConfiguration,
} from '@latitude-data/constants/documentTriggers'
import { LatitudeError } from './../../lib/errors'
import * as pipedreamModule from '../integrations/pipedream/triggers'
import { Result } from '../../lib/Result'

describe('updateDocumentTriggerConfiguration', () => {
  let workspace: Workspace
  let project: Project
  let document: DocumentVersion
  let mockTx: any
  let mockUpdate: any
  let mockSet: any
  let mockWhere: any
  let mockReturning: any

  const mocks = vi.hoisted(() => ({
    transactionMock: vi.fn(),
  }))

  beforeEach(() => {
    // Setup test data
    workspace = { id: 1 } as Workspace
    project = { id: 2 } as Project
    document = { documentUuid: 'test-doc-uuid' } as DocumentVersion

    // Setup mock transaction and database
    mockReturning = vi.fn()
    mockWhere = vi.fn().mockReturnValue({ returning: mockReturning })
    mockSet = vi.fn().mockReturnValue({ where: mockWhere })
    mockUpdate = vi.fn().mockReturnValue({ set: mockSet })
    mockTx = { update: mockUpdate }

    mocks.transactionMock.prototype.call = vi.fn(
      async (fn: (tx: any) => Promise<any>) => {
        return await fn(mockTx)
      },
    )

    vi.mock('./../../lib/Transaction', async (importOriginal) => ({
      ...(await importOriginal()),
      default: mocks.transactionMock,
    }))

    // Mock the buildConfiguration function
    vi.spyOn(buildConfigurationModule, 'buildConfiguration').mockImplementation(
      ({ triggerType, configuration }) => {
        if (triggerType === DocumentTriggerType.Email) {
          return configuration as EmailTriggerConfiguration
        } else if (triggerType === DocumentTriggerType.Scheduled) {
          return {
            ...(configuration as InsertScheduledTriggerConfiguration),
            lastRun: new Date('2023-01-01'),
            nextRunTime: new Date('2023-01-02'),
          } as ScheduledTriggerConfiguration
        } else {
          return configuration as IntegrationTriggerConfiguration
        }
      },
    )

    // Reset and mock pipedream update
    vi.spyOn(pipedreamModule, 'updatePipedreamTrigger').mockReset()
  })

  it('updates an email document trigger configuration successfully', async () => {
    const emailConfiguration: EmailTriggerConfiguration = {
      emailWhitelist: ['test@example.com'],
      replyWithResponse: false,
    }

    const existing: DocumentTrigger = {
      id: 10,
      uuid: 'existing-uuid',
      workspaceId: workspace.id,
      projectId: project.id,
      documentUuid: document.documentUuid,
      triggerType: DocumentTriggerType.Email,
      configuration: emailConfiguration,
      createdAt: new Date('2023-01-01'),
      updatedAt: new Date('2023-01-01'),
    } as unknown as DocumentTrigger

    const updatedRow = {
      ...existing,
      configuration: emailConfiguration,
    } as DocumentTrigger

    mockReturning.mockResolvedValue([updatedRow])

    const result = await updateDocumentTriggerConfiguration({
      workspace,
      documentTrigger: existing,
      configuration: emailConfiguration,
    })

    expect(result.error).toBeUndefined()
    expect(result.value).toBeDefined()

    expect(mocks.transactionMock.prototype.call).toHaveBeenCalledWith(
      expect.any(Function),
    )
    expect(mockUpdate).toHaveBeenCalledWith(documentTriggers)
    expect(mockSet).toHaveBeenCalledWith({
      configuration: emailConfiguration,
    })
    expect(buildConfigurationModule.buildConfiguration).toHaveBeenCalledWith({
      triggerType: DocumentTriggerType.Email,
      configuration: emailConfiguration,
    })

    expect(result.value).toEqual(updatedRow)
  })

  it('updates a scheduled document trigger configuration successfully', async () => {
    const scheduledConfiguration: InsertScheduledTriggerConfiguration = {
      cronExpression: '0 0 * * *',
    }

    const expectedConfiguration: ScheduledTriggerConfiguration = {
      ...scheduledConfiguration,
      lastRun: new Date('2023-01-01'),
      nextRunTime: new Date('2023-01-02'),
    }

    const existing: DocumentTrigger = {
      id: 11,
      uuid: 'existing-uuid-2',
      workspaceId: workspace.id,
      projectId: project.id,
      documentUuid: document.documentUuid,
      triggerType: DocumentTriggerType.Scheduled,
      configuration: expectedConfiguration,
      createdAt: new Date('2023-01-01'),
      updatedAt: new Date('2023-01-01'),
    } as unknown as DocumentTrigger

    const updatedRow = {
      ...existing,
      configuration: expectedConfiguration,
    } as DocumentTrigger

    mockReturning.mockResolvedValue([updatedRow])

    const result = await updateDocumentTriggerConfiguration({
      workspace,
      documentTrigger: existing,
      configuration: scheduledConfiguration,
    })

    expect(result.error).toBeUndefined()
    expect(result.value).toBeDefined()

    expect(mocks.transactionMock.prototype.call).toHaveBeenCalledWith(
      expect.any(Function),
    )
    expect(mockUpdate).toHaveBeenCalledWith(documentTriggers)
    expect(mockSet).toHaveBeenCalledWith({
      configuration: expectedConfiguration,
    })
    expect(buildConfigurationModule.buildConfiguration).toHaveBeenCalledWith({
      triggerType: DocumentTriggerType.Scheduled,
      configuration: scheduledConfiguration,
    })

    expect(result.value).toEqual(updatedRow)
  })

  it('updates an integration document trigger configuration successfully (preupdate ok)', async () => {
    const originalIntegrationConfig: IntegrationTriggerConfiguration = {
      integrationId: 1,
      componentId: 'comp-1',
      properties: { a: 1 },
      payloadParameters: ['x'],
      triggerId: 'trg-123',
    }

    const updatedIntegrationConfig: InsertIntegrationTriggerConfiguration = {
      integrationId: 2,
      componentId: 'comp-2',
      properties: { b: 2 },
      payloadParameters: ['y'],
    }

    const preupdatedReturnedConfig: IntegrationTriggerConfiguration = {
      ...updatedIntegrationConfig,
      triggerId: 'new-trg-456',
    }

    const existing: DocumentTrigger = {
      id: 12,
      uuid: 'existing-uuid-3',
      workspaceId: workspace.id,
      projectId: project.id,
      documentUuid: document.documentUuid,
      triggerType: DocumentTriggerType.Integration,
      configuration: originalIntegrationConfig,
      createdAt: new Date('2023-01-01'),
      updatedAt: new Date('2023-01-01'),
    } as unknown as DocumentTrigger

    const updatedRow = {
      ...existing,
      configuration: preupdatedReturnedConfig,
    } as DocumentTrigger

    vi.mocked(pipedreamModule.updatePipedreamTrigger).mockResolvedValue(
      Result.ok(preupdatedReturnedConfig),
    )

    mockReturning.mockResolvedValue([updatedRow])

    const result = await updateDocumentTriggerConfiguration({
      workspace,
      documentTrigger: existing,
      configuration: updatedIntegrationConfig,
    })

    expect(result.error).toBeUndefined()
    expect(result.value).toBeDefined()

    expect(pipedreamModule.updatePipedreamTrigger).toHaveBeenCalledWith({
      workspace,
      trigger: existing as any,
      updatedConfig: updatedIntegrationConfig,
    })

    expect(mockUpdate).toHaveBeenCalledWith(documentTriggers)
    expect(mockSet).toHaveBeenCalledWith({
      configuration: preupdatedReturnedConfig,
    })
    expect(buildConfigurationModule.buildConfiguration).toHaveBeenCalledWith({
      triggerType: DocumentTriggerType.Integration,
      configuration: preupdatedReturnedConfig,
    })

    expect(result.value).toEqual(updatedRow)
  })

  it('returns error if integration preupdate fails', async () => {
    const originalIntegrationConfig: IntegrationTriggerConfiguration = {
      integrationId: 1,
      componentId: 'comp-1',
      properties: { a: 1 },
      payloadParameters: ['x'],
      triggerId: 'trg-123',
    }

    const updatedIntegrationConfig: InsertIntegrationTriggerConfiguration = {
      integrationId: 1,
      componentId: 'comp-1',
      properties: { a: 2 },
      payloadParameters: ['x'],
    }

    const existing: DocumentTrigger = {
      id: 13,
      uuid: 'existing-uuid-4',
      workspaceId: workspace.id,
      projectId: project.id,
      documentUuid: document.documentUuid,
      triggerType: DocumentTriggerType.Integration,
      configuration: originalIntegrationConfig,
      createdAt: new Date('2023-01-01'),
      updatedAt: new Date('2023-01-01'),
    } as unknown as DocumentTrigger

    const preupdateError = new Error('preupdate failed')

    vi.mocked(pipedreamModule.updatePipedreamTrigger).mockResolvedValue(
      Result.error(preupdateError),
    )

    const result = await updateDocumentTriggerConfiguration({
      workspace,
      documentTrigger: existing,
      configuration: updatedIntegrationConfig,
    })

    expect(result.ok).toBeFalsy()
    expect(result.error).toBe(preupdateError)
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('returns an error when document trigger update fails', async () => {
    const emailConfiguration: EmailTriggerConfiguration = {
      emailWhitelist: ['test@example.com'],
      replyWithResponse: true,
    }

    const existing: DocumentTrigger = {
      id: 14,
      uuid: 'existing-uuid-5',
      workspaceId: workspace.id,
      projectId: project.id,
      documentUuid: document.documentUuid,
      triggerType: DocumentTriggerType.Email,
      configuration: emailConfiguration,
      createdAt: new Date('2023-01-01'),
      updatedAt: new Date('2023-01-01'),
    } as unknown as DocumentTrigger

    mockReturning.mockResolvedValue([])

    const result = await updateDocumentTriggerConfiguration({
      workspace,
      documentTrigger: existing,
      configuration: emailConfiguration,
    })

    expect(result.ok).toBeFalsy()
    expect(result.error).toBeInstanceOf(LatitudeError)
    expect(result.error?.message).toBe(
      'Failed to update document trigger configuration',
    )
    expect(mocks.transactionMock.prototype.call).toHaveBeenCalledWith(
      expect.any(Function),
    )
    expect(mockUpdate).toHaveBeenCalledWith(documentTriggers)
    expect(mockSet).toHaveBeenCalledWith({ configuration: emailConfiguration })
  })
})
