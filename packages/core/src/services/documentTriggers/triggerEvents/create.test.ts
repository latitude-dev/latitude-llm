import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DocumentTriggerType } from '@latitude-data/constants'
import { EmailTriggerEventPayload } from '@latitude-data/constants/documentTriggers'
import {
  Commit,
  Project,
  Workspace,
  DocumentTrigger,
} from '../../../schema/types'
import { createDocumentTriggerEvent } from './create'
import * as factories from '../../../tests/factories'
import { DocumentTriggerEventsRepository } from '../../../repositories'

const mocks = vi.hoisted(() => ({
  publisher: {
    publishLater: vi.fn(),
  },
}))

vi.mock('../../../events/publisher', () => ({
  publisher: mocks.publisher,
}))

describe('createDocumentTriggerEvent', () => {
  let workspace: Workspace
  let project: Project
  let commit: Commit
  let trigger: DocumentTrigger<DocumentTriggerType.Email>

  beforeEach(async () => {
    // Reset all mocks
    vi.clearAllMocks()

    const {
      workspace: w,
      project: p,
      commit: c,
    } = await factories.createProject({
      skipMerge: true,
    })

    workspace = w
    project = p
    commit = c

    // Create a document trigger for testing
    trigger = await factories.createEmailDocumentTrigger({
      workspaceId: workspace.id,
      projectId: project.id,
      commitId: commit.id,
    })
  })

  it('creates email trigger event with correct configuration', async () => {
    const emailEventPayload: EmailTriggerEventPayload = {
      recipient: 'test@example.com',
      senderEmail: 'sender@example.com',
      senderName: 'Test Sender',
      subject: 'Test Subject',
      body: 'Test email body',
      messageId: 'msg-123',
      parentMessageIds: ['parent-123'],
      attachments: [],
    }

    const result = await createDocumentTriggerEvent({
      commit,
      trigger,
      eventPayload: emailEventPayload,
    })

    const eventsRepo = new DocumentTriggerEventsRepository(workspace.id)
    const events = await eventsRepo
      .findByTrigger(trigger)
      .then((r) => r.unwrap())

    const event = events[0]!

    expect(result.ok).toBeTruthy()
    expect(event).toBeDefined()
    expect(event.workspaceId).toBe(workspace.id)
    expect(event.triggerUuid).toBe(trigger.uuid)
    expect(event.triggerType).toBe(DocumentTriggerType.Email)
    expect(event.triggerHash).toBe(trigger.triggerHash)
    expect(event.payload).toEqual(emailEventPayload)
  })

  it('should emit documentTriggerEventCreated event when trigger event is created successfully', async () => {
    // Arrange
    const emailEventPayload: EmailTriggerEventPayload = {
      recipient: 'test@example.com',
      senderEmail: 'sender@example.com',
      subject: 'Test Subject',
      body: 'Test email body',
      attachments: [],
    }

    // Act
    const result = await createDocumentTriggerEvent({
      commit,
      trigger,
      eventPayload: emailEventPayload,
    })

    // Assert
    expect(result.ok).toBeTruthy()
    expect(mocks.publisher.publishLater).toHaveBeenCalledWith({
      type: 'documentTriggerEventCreated',
      data: {
        workspaceId: workspace.id,
        commit,
        documentTriggerEvent: expect.objectContaining({
          workspaceId: workspace.id,
          triggerUuid: trigger.uuid,
          triggerType: DocumentTriggerType.Email,
          triggerHash: trigger.triggerHash,
          payload: emailEventPayload,
        }),
      },
    })
  })
})
