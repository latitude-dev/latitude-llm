import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DocumentTriggerType, Providers } from '@latitude-data/constants'
import {
  Commit,
  Project,
  Workspace,
  DocumentVersion,
  User,
} from '../../../../schema/types'
import { Result } from '../../../../lib/Result'
import * as factories from '../../../../tests/factories'
import { mergeCommit } from '../../../commits'
import { createNewDocument } from '../../../documents'
import { findAndRegisterScheduledTriggerEvents } from './registerEvents'
import { database } from '../../../../client'
import { eq } from 'drizzle-orm'
import { documentTriggers } from '../../../../schema/models/documentTriggers'
import { documentTriggerEvents } from '../../../../schema/models/documentTriggerEvents'
import { ScheduledTriggerDeploymentSettings } from '@latitude-data/constants/documentTriggers'

const mocks = vi.hoisted(() => ({
  enqueueRunDocumentFromTriggerEventJob: vi.fn(),
}))

vi.mock('../../triggerEvents/enqueueRunDocumentFromTriggerEventJob', () => ({
  enqueueRunDocumentFromTriggerEventJob:
    mocks.enqueueRunDocumentFromTriggerEventJob,
}))

describe('findAndRegisterScheduledTriggerEvents', () => {
  let workspace: Workspace
  let project: Project
  let draft: Commit
  let live: Commit
  let document: DocumentVersion
  let user: User

  beforeEach(async () => {
    vi.clearAllMocks()

    const {
      workspace: w,
      project: p,
      commit: c,
      documents,
      user: u,
    } = await factories.createProject({
      providers: [{ name: 'openai', type: Providers.OpenAI }],
      documents: {
        foo: factories.helpers.createPrompt({ provider: 'openai' }),
      },
      skipMerge: true,
    })

    workspace = w
    project = p
    draft = c
    document = documents[0]!
    user = u

    // Create live commit
    const liveResult = await mergeCommit(draft)
    live = liveResult.unwrap()

    // Mock job enqueue to always succeed
    mocks.enqueueRunDocumentFromTriggerEventJob.mockResolvedValue(Result.ok({}))
  })

  describe('when no scheduled triggers exist', () => {
    it('returns empty array', async () => {
      const result = await findAndRegisterScheduledTriggerEvents()

      expect(result.ok).toBeTruthy()
      expect(result.unwrap()).toEqual([])
    })
  })

  describe('when scheduled triggers exist but none are due', () => {
    it('returns empty array', async () => {
      // Create a scheduled trigger with nextRunTime in the future
      const futureDate = new Date(Date.now() + 60 * 60 * 1000) // 1 hour from now
      await factories.createScheduledDocumentTrigger({
        workspaceId: workspace.id,
        projectId: project.id,
        commitId: live.id,
        documentUuid: document.documentUuid,
        cronExpression: '0 * * * *', // Every hour
        nextRunTime: futureDate,
      })

      const result = await findAndRegisterScheduledTriggerEvents()

      expect(result.ok).toBeTruthy()
      expect(result.unwrap()).toEqual([])
    })
  })

  describe('when scheduled triggers are due to run', () => {
    it('processes triggers with nextRunTime in the past', async () => {
      // Create a scheduled trigger with nextRunTime in the past
      const pastDate = new Date(Date.now() - 60 * 60 * 1000) // 1 hour ago
      const trigger = await factories.createScheduledDocumentTrigger({
        workspaceId: workspace.id,
        projectId: project.id,
        commitId: live.id,
        documentUuid: document.documentUuid,
        cronExpression: '0 * * * *', // Every hour
        nextRunTime: pastDate,
      })

      const result = await findAndRegisterScheduledTriggerEvents()

      expect(result.ok).toBeTruthy()
      const events = result.unwrap()
      expect(events).toHaveLength(1)
      expect(events[0]!.triggerUuid).toBe(trigger.uuid)
      expect(events[0]!.triggerHash).toBe(trigger.triggerHash)
      expect(events[0]!.workspaceId).toBe(workspace.id)
    })

    it('processes triggers without nextRunTime based on cron expression', async () => {
      // Create a scheduled trigger with lastRun more than an hour ago (so it's due)
      const lastRunDate = new Date(Date.now() - 2 * 60 * 60 * 1000) // 2 hours ago
      const trigger = await factories.createScheduledDocumentTrigger({
        workspaceId: workspace.id,
        projectId: project.id,
        commitId: live.id,
        documentUuid: document.documentUuid,
        cronExpression: '0 * * * *', // Every hour
        lastRun: lastRunDate,
        // No nextRunTime set
      })

      const result = await findAndRegisterScheduledTriggerEvents()

      expect(result.ok).toBeTruthy()
      const events = result.unwrap()
      expect(events).toHaveLength(1)
      expect(events[0]!.triggerUuid).toBe(trigger.uuid)
    })

    it('updates trigger nextRunTime after processing', async () => {
      const pastDate = new Date(Date.now() - 60 * 60 * 1000) // 1 hour ago
      const trigger = await factories.createScheduledDocumentTrigger({
        workspaceId: workspace.id,
        projectId: project.id,
        commitId: live.id,
        documentUuid: document.documentUuid,
        cronExpression: '0 * * * *', // Every hour
        nextRunTime: pastDate,
      })

      await findAndRegisterScheduledTriggerEvents()

      // Check that nextRunTime was updated
      const [updatedTrigger] = await database
        .select()
        .from(documentTriggers)
        .where(eq(documentTriggers.id, trigger.id))

      expect(updatedTrigger!.deploymentSettings).toBeTruthy()
      const deploymentSettings = updatedTrigger!
        .deploymentSettings as ScheduledTriggerDeploymentSettings
      expect(deploymentSettings.nextRunTime).toBeTruthy()
      expect(new Date(deploymentSettings.nextRunTime!)).toBeInstanceOf(Date)
      expect(
        new Date(deploymentSettings.nextRunTime!).getTime(),
      ).toBeGreaterThan(pastDate.getTime())
    })

    it('creates trigger events in the database', async () => {
      const pastDate = new Date(Date.now() - 60 * 60 * 1000) // 1 hour ago
      const trigger = await factories.createScheduledDocumentTrigger({
        workspaceId: workspace.id,
        projectId: project.id,
        commitId: live.id,
        documentUuid: document.documentUuid,
        cronExpression: '0 * * * *', // Every hour
        nextRunTime: pastDate,
      })

      await findAndRegisterScheduledTriggerEvents()

      // Check that a trigger event was created
      const [event] = await database
        .select()
        .from(documentTriggerEvents)
        .where(eq(documentTriggerEvents.triggerUuid, trigger.uuid))

      expect(event).toBeTruthy()
      expect(event!.triggerUuid).toBe(trigger.uuid)
      expect(event!.triggerHash).toBe(trigger.triggerHash)
      expect(event!.workspaceId).toBe(workspace.id)
      expect(event!.payload).toEqual({})
    })

    it('skips disabled triggers even if they are due to run', async () => {
      // Create an enabled trigger that is due to run
      const pastDate = new Date(Date.now() - 60 * 60 * 1000) // 1 hour ago
      const enabledTrigger = await factories.createScheduledDocumentTrigger({
        workspaceId: workspace.id,
        projectId: project.id,
        commitId: live.id,
        documentUuid: document.documentUuid,
        cronExpression: '0 * * * *',
        nextRunTime: pastDate,
        enabled: true, // Explicitly enabled
      })

      await factories.createScheduledDocumentTrigger({
        workspaceId: workspace.id,
        projectId: project.id,
        commitId: live.id,
        documentUuid: document.documentUuid,
        cronExpression: '0 * * * *',
        nextRunTime: pastDate,
        enabled: false, // Explicitly disabled
      })

      const result = await findAndRegisterScheduledTriggerEvents()

      expect(result.ok).toBeTruthy()
      const events = result.unwrap()
      // Should only process the enabled trigger, not the disabled one
      expect(events).toHaveLength(1)
      expect(events[0]!.triggerUuid).toBe(enabledTrigger.uuid)
    })
  })

  describe('when processing multiple triggers', () => {
    it('processes all due triggers', async () => {
      const pastDate = new Date(Date.now() - 60 * 60 * 1000) // 1 hour ago

      // Create multiple scheduled triggers
      const trigger1 = await factories.createScheduledDocumentTrigger({
        workspaceId: workspace.id,
        projectId: project.id,
        commitId: live.id,
        documentUuid: document.documentUuid,
        cronExpression: '0 * * * *',
        nextRunTime: pastDate,
      })

      const trigger2 = await factories.createScheduledDocumentTrigger({
        workspaceId: workspace.id,
        projectId: project.id,
        commitId: live.id,
        documentUuid: document.documentUuid,
        cronExpression: '*/30 * * * *', // Every 30 minutes
        nextRunTime: pastDate,
      })

      const result = await findAndRegisterScheduledTriggerEvents()

      expect(result.ok).toBeTruthy()
      const events = result.unwrap()
      expect(events).toHaveLength(2)

      const triggerUuids = events.map((e) => e.triggerUuid)
      expect(triggerUuids).toContain(trigger1.uuid)
      expect(triggerUuids).toContain(trigger2.uuid)
    })

    it('skips triggers that are not due', async () => {
      const pastDate = new Date(Date.now() - 60 * 60 * 1000) // 1 hour ago
      const futureDate = new Date(Date.now() + 60 * 60 * 1000) // 1 hour from now

      // Create one due trigger and one not due
      const dueTrigger = await factories.createScheduledDocumentTrigger({
        workspaceId: workspace.id,
        projectId: project.id,
        commitId: live.id,
        documentUuid: document.documentUuid,
        cronExpression: '0 * * * *',
        nextRunTime: pastDate,
      })

      await factories.createScheduledDocumentTrigger({
        workspaceId: workspace.id,
        projectId: project.id,
        commitId: live.id,
        documentUuid: document.documentUuid,
        cronExpression: '0 * * * *',
        nextRunTime: futureDate,
      })

      const result = await findAndRegisterScheduledTriggerEvents()

      expect(result.ok).toBeTruthy()
      const events = result.unwrap()
      expect(events).toHaveLength(1)
      expect(events[0]!.triggerUuid).toBe(dueTrigger.uuid)
    })
  })

  describe('when trigger is from a merged commit (not live)', () => {
    it('uses live commit for the event', async () => {
      // Create another draft commit in the same project and merge it
      const { commit: anotherDraft } = await factories.createDraft({
        project,
        user,
      })

      // Add a document to make the merge valid
      await createNewDocument({
        commit: anotherDraft,
        path: 'bar',
        content: factories.helpers.createPrompt({ provider: 'openai' }),
        user,
        workspace,
      })

      // Create trigger on the old live commit (which is now merged but not the current live)
      const pastDate = new Date(Date.now() - 60 * 60 * 1000)
      const trigger = await factories.createScheduledDocumentTrigger({
        workspaceId: workspace.id,
        projectId: project.id,
        commitId: live.id, // Old live commit
        documentUuid: document.documentUuid,
        cronExpression: '0 * * * *',
        nextRunTime: pastDate,
      })

      const result = await findAndRegisterScheduledTriggerEvents()

      expect(result.ok).toBeTruthy()
      const events = result.unwrap()
      expect(events).toHaveLength(1)

      // Event should use the current live commit, not the trigger's commit
      expect(events[0]!.triggerHash).toBe(trigger.triggerHash)
      expect(events[0]!.triggerUuid).toBe(trigger.uuid)
    })
  })

  describe('when trigger is not deployed', () => {
    it('ignores triggers without deployment settings', async () => {
      // Create a trigger without deployment settings (not deployed)
      await database.insert(documentTriggers).values({
        workspaceId: workspace.id,
        projectId: project.id,
        commitId: live.id,
        documentUuid: document.documentUuid,
        triggerType: DocumentTriggerType.Scheduled,
        triggerHash: '',
        configuration: { cronExpression: '0 * * * *' },
        deploymentSettings: null, // Not deployed
      })

      const result = await findAndRegisterScheduledTriggerEvents()

      expect(result.ok).toBeTruthy()
      expect(result.unwrap()).toEqual([])
    })
  })

  describe('error handling', () => {
    it('handles database errors gracefully', async () => {
      // Mock database to throw error
      const originalSelect = database.select
      vi.spyOn(database, 'select').mockImplementationOnce(() => {
        throw new Error('Database connection failed')
      })

      const result = await findAndRegisterScheduledTriggerEvents()

      expect(result.ok).toBeFalsy()
      expect(result.error?.message).toBe('Database connection failed')

      // Restore original implementation
      database.select = originalSelect
    })
  })

  describe('cron expression edge cases', () => {
    it('handles invalid cron expressions gracefully', async () => {
      // Create trigger with invalid cron expression
      const lastRunDate = new Date(Date.now() - 2 * 60 * 60 * 1000) // 2 hours ago
      await factories.createScheduledDocumentTrigger({
        workspaceId: workspace.id,
        projectId: project.id,
        commitId: live.id,
        documentUuid: document.documentUuid,
        cronExpression: 'invalid-cron', // Invalid cron
        lastRun: lastRunDate,
      })

      const result = await findAndRegisterScheduledTriggerEvents()

      // Should not fail but also should not process the invalid trigger
      expect(result.ok).toBeTruthy()
      expect(result.unwrap()).toEqual([])
    })

    it('processes complex cron expressions correctly', async () => {
      // Create trigger with complex cron (every weekday at 9 AM)
      const pastDate = new Date(Date.now() - 60 * 60 * 1000)
      const trigger = await factories.createScheduledDocumentTrigger({
        workspaceId: workspace.id,
        projectId: project.id,
        commitId: live.id,
        documentUuid: document.documentUuid,
        cronExpression: '0 9 * * 1-5', // 9 AM on weekdays
        nextRunTime: pastDate,
      })

      const result = await findAndRegisterScheduledTriggerEvents()

      expect(result.ok).toBeTruthy()
      const events = result.unwrap()
      expect(events).toHaveLength(1)
      expect(events[0]!.triggerUuid).toBe(trigger.uuid)
    })
  })
})
