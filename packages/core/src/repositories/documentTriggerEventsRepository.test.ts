import { beforeEach, describe, expect, it } from 'vitest'
import { Commit, Project, Providers, User, Workspace } from '../browser'
import { EmailTriggerEventPayload } from '@latitude-data/constants/documentTriggers'
import * as factories from '../tests/factories'
import { DocumentTriggerEventsRepository } from './documentTriggerEventsRepository'
import { database } from '../client'
import { commits } from '../schema'
import { eq } from 'drizzle-orm'
import { v4 as uuidv4 } from 'uuid'
import { DocumentTriggerType } from '@latitude-data/constants'

describe('DocumentTriggerEventsRepository', () => {
  let workspace: Workspace
  let project: Project
  let user: User
  let commit: Commit
  let repo: DocumentTriggerEventsRepository

  beforeEach(async () => {
    const {
      workspace: w,
      project: p,
      user: u,
      commit: c,
    } = await factories.createProject({
      providers: [{ name: 'openai', type: Providers.OpenAI }],
      documents: {
        doc1: factories.helpers.createPrompt({ provider: 'openai' }),
        doc2: factories.helpers.createPrompt({ provider: 'openai' }),
      },
    })

    workspace = w
    project = p
    user = u
    commit = c
    repo = new DocumentTriggerEventsRepository(workspace.id)
  })

  describe('getAllTriggerEventsInWorkspace', () => {
    it('returns empty array when no trigger events exist', async () => {
      const result = await repo.getAllTriggerEventsInWorkspace()

      expect(result.ok).toBeTruthy()
      expect(result.unwrap()).toEqual([])
    })

    it('returns all trigger events in the workspace', async () => {
      // Create trigger events directly using factory
      const emailEvent = await factories.createEmailDocumentTriggerEvent({
        workspaceId: workspace.id,
        commitId: commit.id,
        triggerUuid: uuidv4(),
      })

      const scheduledEvent =
        await factories.createScheduledDocumentTriggerEvent({
          workspaceId: workspace.id,
          commitId: commit.id,
          triggerUuid: uuidv4(),
        })

      const integrationEvent =
        await factories.createIntegrationDocumentTriggerEvent({
          workspaceId: workspace.id,
          commitId: commit.id,
          triggerUuid: uuidv4(),
        })

      const result = await repo.getAllTriggerEventsInWorkspace()
      const events = result.unwrap()

      expect(events).toHaveLength(3)
      expect(events.map((e) => e.id).sort()).toEqual(
        [emailEvent.id, scheduledEvent.id, integrationEvent.id].sort(),
      )
    })

    it('returns events sorted by creation time (newest first)', async () => {
      // Create events sequentially
      const firstEvent = await factories.createEmailDocumentTriggerEvent({
        workspaceId: workspace.id,
        commitId: commit.id,
        triggerUuid: uuidv4(),
      })

      const secondEvent = await factories.createScheduledDocumentTriggerEvent({
        workspaceId: workspace.id,
        commitId: commit.id,
        triggerUuid: uuidv4(),
      })

      const thirdEvent = await factories.createIntegrationDocumentTriggerEvent({
        workspaceId: workspace.id,
        commitId: commit.id,
        triggerUuid: uuidv4(),
      })

      const result = await repo.getAllTriggerEventsInWorkspace()
      const events = result.unwrap()

      expect(events).toHaveLength(3)

      // Verify timestamps are in descending order (newest first)
      for (let i = 0; i < events.length - 1; i++) {
        expect(events[i]!.createdAt.getTime()).toBeGreaterThanOrEqual(
          events[i + 1]!.createdAt.getTime(),
        )
      }

      // Since database timestamps might be the same, check that events with same timestamps
      // are at least ordered consistently by id (newer IDs should come first when timestamps are equal)
      const sortedByIdDesc = [thirdEvent, secondEvent, firstEvent].sort(
        (a, b) => b.id - a.id,
      )
      const expectedOrder = sortedByIdDesc.map((e) => e.id)
      const actualOrder = events.map((e) => e.id)

      // Should be sorted by createdAt DESC, then by id DESC for ties
      expect(actualOrder).toEqual(expectedOrder)
    })

    it('excludes events from different workspaces', async () => {
      // Create event in current workspace
      const eventInWorkspace = await factories.createEmailDocumentTriggerEvent({
        workspaceId: workspace.id,
        commitId: commit.id,
        triggerUuid: uuidv4(),
      })

      // Create event in different workspace
      const { workspace: otherWorkspace, commit: otherCommit } =
        await factories.createProject({
          providers: [{ name: 'openai2', type: Providers.OpenAI }],
          documents: {
            doc1: factories.helpers.createPrompt({ provider: 'openai2' }),
          },
        })

      await factories.createEmailDocumentTriggerEvent({
        workspaceId: otherWorkspace.id,
        commitId: otherCommit.id,
        triggerUuid: uuidv4(),
      })

      const result = await repo.getAllTriggerEventsInWorkspace()
      const events = result.unwrap()

      expect(events).toHaveLength(1)
      expect(events[0]!.id).toBe(eventInWorkspace.id)
      expect(events[0]!.workspaceId).toBe(workspace.id)
    })

    it('excludes events from deleted commits', async () => {
      // Create a new draft and mark it as deleted
      const { commit: draftCommit } = await factories.createDraft({
        project,
        user,
      })

      await factories.createEmailDocumentTriggerEvent({
        workspaceId: workspace.id,
        commitId: draftCommit.id,
        triggerUuid: uuidv4(),
      })

      // Mark commit as deleted
      await database
        .update(commits)
        .set({ deletedAt: new Date() })
        .where(eq(commits.id, draftCommit.id))

      const result = await repo.getAllTriggerEventsInWorkspace()
      const events = result.unwrap()

      expect(events).toHaveLength(0)
    })
  })

  describe('getTriggerEventsInTrigger', () => {
    it('returns empty array when no events exist for trigger', async () => {
      const triggerUuid = uuidv4()
      const result = await repo.getTriggerEventsInTrigger({ triggerUuid })

      expect(result.ok).toBeTruthy()
      expect(result.unwrap()).toEqual([])
    })

    it('returns events only for specified trigger', async () => {
      const trigger1Uuid = uuidv4()
      const trigger2Uuid = uuidv4()

      // Create events for different triggers
      const event1 = await factories.createEmailDocumentTriggerEvent({
        workspaceId: workspace.id,
        commitId: commit.id,
        triggerUuid: trigger1Uuid,
      })

      const event2 = await factories.createScheduledDocumentTriggerEvent({
        workspaceId: workspace.id,
        commitId: commit.id,
        triggerUuid: trigger1Uuid,
      })

      await factories.createIntegrationDocumentTriggerEvent({
        workspaceId: workspace.id,
        commitId: commit.id,
        triggerUuid: trigger2Uuid,
      })

      const result = await repo.getTriggerEventsInTrigger({
        triggerUuid: trigger1Uuid,
      })
      const events = result.unwrap()

      expect(events).toHaveLength(2)
      expect(events.map((e) => e.id).sort()).toEqual(
        [event1.id, event2.id].sort(),
      )
      expect(events.every((e) => e.triggerUuid === trigger1Uuid)).toBe(true)
    })

    it('returns trigger events sorted by creation time (newest first)', async () => {
      const triggerUuid = uuidv4()

      // Create events sequentially
      const firstEvent = await factories.createEmailDocumentTriggerEvent({
        workspaceId: workspace.id,
        commitId: commit.id,
        triggerUuid,
      })

      const secondEvent = await factories.createScheduledDocumentTriggerEvent({
        workspaceId: workspace.id,
        commitId: commit.id,
        triggerUuid,
      })

      const result = await repo.getTriggerEventsInTrigger({ triggerUuid })
      const events = result.unwrap()

      expect(events).toHaveLength(2)

      // Verify timestamps are in descending order (newest first)
      expect(events[0]!.createdAt.getTime()).toBeGreaterThanOrEqual(
        events[1]!.createdAt.getTime(),
      )

      // Check that events are ordered consistently (newer IDs first when timestamps are equal)
      const sortedByIdDesc = [secondEvent, firstEvent].sort(
        (a, b) => b.id - a.id,
      )
      const expectedOrder = sortedByIdDesc.map((e) => e.id)
      const actualOrder = events.map((e) => e.id)

      // Should be sorted by createdAt DESC, then by id DESC for ties
      expect(actualOrder).toEqual(expectedOrder)
    })

    it('respects commit parameter for trigger events', async () => {
      const triggerUuid = uuidv4()

      // Create event in main commit
      const eventInMainCommit = await factories.createEmailDocumentTriggerEvent(
        {
          workspaceId: workspace.id,
          commitId: commit.id,
          triggerUuid,
        },
      )

      // Create new draft and add another event for same trigger
      const { commit: draftCommit } = await factories.createDraft({
        project,
        user,
      })

      const eventInDraft = await factories.createScheduledDocumentTriggerEvent({
        workspaceId: workspace.id,
        commitId: draftCommit.id,
        triggerUuid,
      })

      // Query events in main commit
      const resultInMainCommit = await repo.getTriggerEventsInTrigger({
        triggerUuid,
        commit,
      })
      const eventsInMainCommit = resultInMainCommit.unwrap()

      expect(eventsInMainCommit).toHaveLength(1)
      expect(eventsInMainCommit[0]!.id).toBe(eventInMainCommit.id)

      // Query events in draft commit
      const resultInDraft = await repo.getTriggerEventsInTrigger({
        triggerUuid,
        commit: draftCommit,
      })
      const eventsInDraft = resultInDraft.unwrap()

      expect(eventsInDraft).toHaveLength(1)
      expect(eventsInDraft[0]!.id).toBe(eventInDraft.id)
    })

    it('returns events for trigger across all commits when no commit specified', async () => {
      const triggerUuid = uuidv4()

      // Create event in main commit
      const eventInMainCommit = await factories.createEmailDocumentTriggerEvent(
        {
          workspaceId: workspace.id,
          commitId: commit.id,
          triggerUuid,
        },
      )

      // Create new draft and add another event for same trigger
      const { commit: draftCommit } = await factories.createDraft({
        project,
        user,
      })

      const eventInDraft = await factories.createScheduledDocumentTriggerEvent({
        workspaceId: workspace.id,
        commitId: draftCommit.id,
        triggerUuid,
      })

      // Query events without specifying commit
      const result = await repo.getTriggerEventsInTrigger({ triggerUuid })
      const events = result.unwrap()

      expect(events).toHaveLength(2)
      expect(events.map((e) => e.id).sort()).toEqual(
        [eventInMainCommit.id, eventInDraft.id].sort(),
      )
    })
  })

  describe('edge cases and integration scenarios', () => {
    it('handles multiple event types correctly', async () => {
      const triggerUuid = uuidv4()

      // Create different types of events for the same trigger
      const emailEvent = await factories.createEmailDocumentTriggerEvent({
        workspaceId: workspace.id,
        commitId: commit.id,
        triggerUuid,
        payload: {
          recipient: 'email@example.com',
          senderEmail: 'sender@example.com',
          subject: 'Email Event',
          body: 'Email body',
          attachments: [],
        },
      })

      const scheduledEvent =
        await factories.createScheduledDocumentTriggerEvent({
          workspaceId: workspace.id,
          commitId: commit.id,
          triggerUuid,
        })

      const integrationEvent =
        await factories.createIntegrationDocumentTriggerEvent({
          workspaceId: workspace.id,
          commitId: commit.id,
          triggerUuid,
          payload: {
            customField: 'integration data',
            timestamp: new Date().toISOString(),
          },
        })

      const allEvents = await repo.getAllTriggerEventsInWorkspace()
      const events = allEvents.unwrap()

      expect(events).toHaveLength(3)

      const eventTypes = events.map((e) => e.triggerType).sort()
      expect(eventTypes).toEqual([
        DocumentTriggerType.Email,
        DocumentTriggerType.Integration,
        DocumentTriggerType.Scheduled,
      ])

      // Verify each event can be found individually
      const emailResult = await repo.getTriggerEventById({ id: emailEvent.id })
      expect(emailResult.unwrap().triggerType).toBe(DocumentTriggerType.Email)

      const scheduledResult = await repo.getTriggerEventById({
        id: scheduledEvent.id,
      })
      expect(scheduledResult.unwrap().triggerType).toBe(
        DocumentTriggerType.Scheduled,
      )

      const integrationResult = await repo.getTriggerEventById({
        id: integrationEvent.id,
      })
      expect(integrationResult.unwrap().triggerType).toBe(
        DocumentTriggerType.Integration,
      )
    })

    it('handles events with documentLogUuid references', async () => {
      // Test with null documentLogUuid (most common case)
      const event = await factories.createEmailDocumentTriggerEvent({
        workspaceId: workspace.id,
        commitId: commit.id,
        triggerUuid: uuidv4(),
        documentLogUuid: null,
      })

      const result = await repo.getTriggerEventById({ id: event.id })
      const foundEvent = result.unwrap()

      expect(foundEvent.documentLogUuid).toBe(null)
    })

    it('handles events across multiple commits and projects correctly', async () => {
      // Create events in different commits of the same project
      const triggerUuid = uuidv4()

      const eventInMainCommit = await factories.createEmailDocumentTriggerEvent(
        {
          workspaceId: workspace.id,
          commitId: commit.id,
          triggerUuid,
        },
      )

      const { commit: draftCommit } = await factories.createDraft({
        project,
        user,
      })
      const eventInDraft = await factories.createScheduledDocumentTriggerEvent({
        workspaceId: workspace.id,
        commitId: draftCommit.id,
        triggerUuid,
      })

      // Create events in different project but same workspace
      const { commit: commit2 } = await factories.createProject({
        workspace,
        providers: [{ name: 'openai4', type: Providers.OpenAI }],
        documents: {
          doc1: factories.helpers.createPrompt({ provider: 'openai4' }),
        },
      })

      const eventInProject2 =
        await factories.createIntegrationDocumentTriggerEvent({
          workspaceId: workspace.id,
          commitId: commit2.id,
          triggerUuid: uuidv4(), // Different trigger
        })

      // Get all events in workspace
      const allEventsResult = await repo.getAllTriggerEventsInWorkspace()
      const allEvents = allEventsResult.unwrap()

      expect(allEvents).toHaveLength(3)
      expect(allEvents.map((e) => e.id).sort()).toEqual(
        [eventInMainCommit.id, eventInDraft.id, eventInProject2.id].sort(),
      )

      // Get events for specific trigger across commits
      const triggerEventsResult = await repo.getTriggerEventsInTrigger({
        triggerUuid,
      })
      const triggerEvents = triggerEventsResult.unwrap()

      expect(triggerEvents).toHaveLength(2)
      expect(triggerEvents.map((e) => e.id).sort()).toEqual(
        [eventInMainCommit.id, eventInDraft.id].sort(),
      )
    })

    it('handles large payloads correctly', async () => {
      const largePayload = {
        recipient: 'large@example.com',
        senderEmail: 'sender@example.com',
        subject: 'Large Payload Test',
        body: 'A'.repeat(10000), // Large body
        attachments: Array.from({ length: 5 }, (_, i) => ({
          type: 'file',
          name: `attachment${i}.txt`,
          mime: 'text/plain',
          mimeType: 'text/plain',
          isImage: false,
          size: 1000 + i,
          bytes: 1000 + i,
          url: `https://example.com/file${i}.txt`,
        })),
        senderName: 'Large Payload Sender',
        messageId: 'large-message-id',
        parentMessageIds: ['parent1', 'parent2'],
      }

      const event = await factories.createEmailDocumentTriggerEvent({
        workspaceId: workspace.id,
        commitId: commit.id,
        triggerUuid: uuidv4(),
        payload: largePayload,
      })

      const result = await repo.getTriggerEventById({ id: event.id })
      const foundEvent = result.unwrap()

      const payload = foundEvent.payload as EmailTriggerEventPayload
      expect(payload.body).toBe(largePayload.body)
      expect(payload.attachments).toHaveLength(5)
      expect(payload.senderName).toBe('Large Payload Sender')
    })
  })
})
