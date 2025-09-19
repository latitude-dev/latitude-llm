import { beforeEach, describe, expect, it } from 'vitest'
import {
  Commit,
  DocumentVersion,
  Project,
  Providers,
  User,
  Workspace,
} from '../browser'
import { NotFoundError } from '@latitude-data/constants/errors'
import { EmailTriggerConfiguration } from '@latitude-data/constants/documentTriggers'
import * as factories from '../tests/factories'
import { mergeCommit } from '../services/commits'
import { updateDocument } from '../services/documents'
import { DocumentTriggersRepository } from './documentTriggersRepository'
import { database } from '../client'
import { documentTriggers } from '../schema'
import { eq } from 'drizzle-orm'
import { v4 as uuidv4 } from 'uuid'
import { DocumentTriggerType } from '@latitude-data/constants'

describe('DocumentTriggersRepository', () => {
  let workspace: Workspace
  let project: Project
  let user: User
  let draft: Commit
  let document: DocumentVersion
  let repo: DocumentTriggersRepository

  beforeEach(async () => {
    const {
      workspace: w,
      project: p,
      user: u,
      commit: c,
      documents,
    } = await factories.createProject({
      providers: [{ name: 'openai', type: Providers.OpenAI }],
      documents: {
        doc1: factories.helpers.createPrompt({ provider: 'openai' }),
        doc2: factories.helpers.createPrompt({ provider: 'openai' }),
      },
      skipMerge: true,
    })

    workspace = w
    project = p
    user = u
    draft = c
    document = documents[0]!
    repo = new DocumentTriggersRepository(workspace.id)
  })

  describe('getAllActiveTriggersInWorkspace', () => {
    it('returns empty array when no triggers exist', async () => {
      const result = await repo.getAllActiveTriggersInWorkspace()

      expect(result.ok).toBeTruthy()
      expect(result.unwrap()).toEqual([])
    })

    it('returns all active triggers from merged commits', async () => {
      // Create triggers in draft commit by inserting directly to database
      const [emailTrigger] = await database
        .insert(documentTriggers)
        .values({
          workspaceId: workspace.id,
          projectId: project.id,
          commitId: draft.id,
          documentUuid: document.documentUuid,
          triggerType: DocumentTriggerType.Email,
          triggerStatus: 'deployed',
          triggerHash: '123',
          configuration: {
            name: 'Test Email Trigger',
            replyWithResponse: true,
          },
        })
        .returning()

      const [scheduledTrigger] = await database
        .insert(documentTriggers)
        .values({
          workspaceId: workspace.id,
          projectId: project.id,
          commitId: draft.id,
          documentUuid: document.documentUuid,
          triggerType: DocumentTriggerType.Scheduled,
          triggerStatus: 'deployed',
          triggerHash: '123',
          configuration: {
            cronExpression: '0 * * * *',
          },
        })
        .returning()

      // Merge the commit
      await mergeCommit(draft).then((r) => r.unwrap())

      const result = await repo.getAllActiveTriggersInWorkspace()
      const triggers = result.unwrap()

      expect(triggers).toHaveLength(2)
      expect(triggers.map((t) => t.uuid).sort()).toEqual(
        [emailTrigger!.uuid, scheduledTrigger!.uuid].sort(),
      )
    })

    it('excludes deleted triggers', async () => {
      // Create trigger in draft
      const [trigger] = await database
        .insert(documentTriggers)
        .values({
          workspaceId: workspace.id,
          projectId: project.id,
          commitId: draft.id,
          documentUuid: document.documentUuid,
          triggerType: DocumentTriggerType.Email,
          triggerStatus: 'deployed',
          triggerHash: '123',
          configuration: {
            name: 'Test Email Trigger',
            replyWithResponse: true,
          },
        })
        .returning()

      // Mark as deleted
      await database
        .update(documentTriggers)
        .set({ deletedAt: new Date() })
        .where(eq(documentTriggers.id, trigger!.id))

      // Merge the commit
      await mergeCommit(draft).then((r) => r.unwrap())

      const result = await repo.getAllActiveTriggersInWorkspace()

      expect(result.unwrap()).toEqual([])
    })

    it('does not include draft triggers', async () => {
      // Create trigger in draft
      const [originalTrigger] = await database
        .insert(documentTriggers)
        .values({
          workspaceId: workspace.id,
          projectId: project.id,
          commitId: draft.id,
          documentUuid: document.documentUuid,
          triggerType: DocumentTriggerType.Email,
          triggerStatus: 'deployed',
          triggerHash: '123',
          configuration: {
            name: 'Original Trigger',
            replyWithResponse: true,
          },
        })
        .returning()

      // Merge the commit
      await mergeCommit(draft).then((r) => r.unwrap())

      // Create new draft with updated trigger (same UUID)
      const { commit: newDraft } = await factories.createDraft({
        project,
        user,
      })

      await database.insert(documentTriggers).values({
        uuid: originalTrigger!.uuid,
        workspaceId: workspace.id,
        projectId: project.id,
        commitId: newDraft.id,
        documentUuid: document.documentUuid,
        triggerType: DocumentTriggerType.Email,
        triggerStatus: 'deployed',
        triggerHash: '123',
        configuration: {
          name: 'Updated Trigger',
          replyWithResponse: true,
        },
      })

      const result = await repo.getAllActiveTriggersInWorkspace()
      const triggers = result.unwrap()

      expect(triggers).toHaveLength(1)
      expect(triggers[0]!.uuid).toBe(originalTrigger!.uuid)
      expect(
        (triggers[0]!.configuration as EmailTriggerConfiguration).name,
      ).toBe('Original Trigger')
    })

    it('excludes triggers from different workspaces', async () => {
      // Create trigger in current workspace
      await database.insert(documentTriggers).values({
        workspaceId: workspace.id,
        projectId: project.id,
        commitId: draft.id,
        documentUuid: document.documentUuid,
        triggerType: DocumentTriggerType.Email,
        triggerStatus: 'deployed',
        triggerHash: '123',
        configuration: {
          name: 'Test Email Trigger',
          replyWithResponse: true,
        },
      })

      // Create trigger in different workspace
      const {
        workspace: otherWorkspace,
        project: otherProject,
        commit: otherCommit,
        documents: otherDocuments,
      } = await factories.createProject({
        providers: [{ name: 'openai4', type: Providers.OpenAI }], // Use different provider name
        documents: {
          doc1: factories.helpers.createPrompt({ provider: 'openai4' }),
        },
      })

      await database.insert(documentTriggers).values({
        workspaceId: otherWorkspace.id,
        projectId: otherProject.id,
        commitId: otherCommit.id,
        documentUuid: otherDocuments[0]!.documentUuid,
        triggerType: DocumentTriggerType.Email,
        triggerStatus: 'deployed',
        triggerHash: '123',
        configuration: {
          name: 'Other Trigger',
          replyWithResponse: true,
        },
      })

      // Merge draft commit (otherCommit is already merged)
      await mergeCommit(draft).then((r) => r.unwrap())

      const result = await repo.getAllActiveTriggersInWorkspace()
      const triggers = result.unwrap()

      expect(triggers).toHaveLength(1)
      expect(triggers[0]!.workspaceId).toBe(workspace.id)
    })
  })

  describe('getTriggersInProject', () => {
    it('returns empty array when no triggers exist in project', async () => {
      const result = await repo.getTriggersInProject({ projectId: project.id })

      expect(result.ok).toBeTruthy()
      expect(result.unwrap()).toEqual([])
    })

    it('returns triggers only from specified project', async () => {
      // Create trigger in current project
      const [trigger1] = await database
        .insert(documentTriggers)
        .values({
          workspaceId: workspace.id,
          projectId: project.id,
          commitId: draft.id,
          documentUuid: document.documentUuid,
          triggerType: DocumentTriggerType.Email,
          triggerStatus: 'deployed',
          triggerHash: '123',
          configuration: {
            name: 'Project 1 Trigger',
            replyWithResponse: true,
          },
        })
        .returning()

      // Create another project in same workspace
      const {
        project: project2,
        commit: draft2,
        documents: documents2,
      } = await factories.createProject({
        workspace,
        providers: [{ name: 'openai2', type: Providers.OpenAI }], // Use different provider name
        documents: {
          doc2: factories.helpers.createPrompt({ provider: 'openai2' }),
        },
      })

      await database.insert(documentTriggers).values({
        workspaceId: workspace.id,
        projectId: project2.id,
        commitId: draft2.id,
        documentUuid: documents2[0]!.documentUuid,
        triggerType: DocumentTriggerType.Email,
        triggerStatus: 'deployed',
        triggerHash: '123',
        configuration: {
          name: 'Project 2 Trigger',
          replyWithResponse: true,
        },
      })

      // Merge draft commit (draft2 is already merged)
      await mergeCommit(draft).then((r) => r.unwrap())

      const result = await repo.getTriggersInProject({ projectId: project.id })
      const triggers = result.unwrap()

      expect(triggers).toHaveLength(1)
      expect(triggers[0]!.uuid).toBe(trigger1!.uuid)
      expect(triggers[0]!.projectId).toBe(project.id)
    })

    it('respects commit parameter for viewing triggers at specific point in time', async () => {
      // Create trigger in draft
      const [trigger] = await database
        .insert(documentTriggers)
        .values({
          workspaceId: workspace.id,
          projectId: project.id,
          commitId: draft.id,
          documentUuid: document.documentUuid,
          triggerType: DocumentTriggerType.Email,
          triggerStatus: 'deployed',
          triggerHash: '123',
          configuration: {
            name: 'Original Trigger',
            replyWithResponse: true,
          },
        })
        .returning()

      // Merge the commit
      const mergedCommit = await mergeCommit(draft).then((r) => r.unwrap())

      // Create new draft and add another trigger
      const { commit: newDraft } = await factories.createDraft({
        project,
        user,
      })

      const [newTrigger] = await database
        .insert(documentTriggers)
        .values({
          workspaceId: workspace.id,
          projectId: project.id,
          commitId: newDraft.id,
          documentUuid: document.documentUuid,
          triggerType: DocumentTriggerType.Scheduled,
          triggerStatus: 'deployed',
          triggerHash: '123',
          configuration: {
            cronExpression: '0 * * * *',
          },
        })
        .returning()

      // Query with merged commit should only show old trigger
      const resultAtMerged = await repo.getTriggersInProject({
        projectId: project.id,
        commit: mergedCommit,
      })
      const triggersAtMerged = resultAtMerged.unwrap()

      expect(triggersAtMerged).toHaveLength(1)
      expect(triggersAtMerged[0]!.uuid).toBe(trigger!.uuid)

      // Query with draft commit should show both triggers
      const resultAtDraft = await repo.getTriggersInProject({
        projectId: project.id,
        commit: newDraft,
      })
      const triggersAtDraft = resultAtDraft.unwrap()

      expect(triggersAtDraft).toHaveLength(2)
      expect(triggersAtDraft.map((t) => t.uuid).sort()).toEqual(
        [trigger!.uuid, newTrigger!.uuid].sort(),
      )
    })
  })

  describe('getTriggersInDocument', () => {
    it('returns empty array when no triggers exist for document', async () => {
      const result = await repo.getTriggersInDocument({
        documentUuid: document.documentUuid,
      })

      expect(result.ok).toBeTruthy()
      expect(result.unwrap()).toEqual([])
    })

    it('returns triggers only for specified document', async () => {
      const document2Uuid = uuidv4()

      // Create triggers for different documents
      const [trigger1] = await database
        .insert(documentTriggers)
        .values({
          workspaceId: workspace.id,
          projectId: project.id,
          commitId: draft.id,
          documentUuid: document.documentUuid,
          triggerType: DocumentTriggerType.Email,
          triggerStatus: 'deployed',
          triggerHash: '123',
          configuration: {
            name: 'Doc 1 Trigger',
            replyWithResponse: true,
          },
        })
        .returning()

      await database.insert(documentTriggers).values({
        workspaceId: workspace.id,
        projectId: project.id,
        commitId: draft.id,
        documentUuid: document2Uuid,
        triggerType: DocumentTriggerType.Scheduled,
        triggerStatus: 'deployed',
        triggerHash: '123',
        configuration: {
          cronExpression: '0 * * * *',
        },
      })

      // Merge the commit
      await mergeCommit(draft).then((r) => r.unwrap())

      const result = await repo.getTriggersInDocument({
        documentUuid: document.documentUuid,
      })
      const triggers = result.unwrap()

      expect(triggers).toHaveLength(1)
      expect(triggers[0]!.uuid).toBe(trigger1!.uuid)
      expect(triggers[0]!.documentUuid).toBe(document.documentUuid)
    })

    it('respects commit parameter for document triggers', async () => {
      // Create trigger in draft
      const [trigger] = await database
        .insert(documentTriggers)
        .values({
          workspaceId: workspace.id,
          projectId: project.id,
          commitId: draft.id,
          documentUuid: document.documentUuid,
          triggerType: DocumentTriggerType.Email,
          triggerStatus: 'deployed',
          triggerHash: '123',
          configuration: {
            name: 'Original Trigger',
            replyWithResponse: true,
          },
        })
        .returning()

      // Merge the commit
      const mergedCommit = await mergeCommit(draft).then((r) => r.unwrap())

      // Create new draft and add another trigger for same document
      const { commit: newDraft } = await factories.createDraft({
        project,
        user,
      })

      const [newTrigger] = await database
        .insert(documentTriggers)
        .values({
          workspaceId: workspace.id,
          projectId: project.id,
          commitId: newDraft.id,
          documentUuid: document.documentUuid,
          triggerType: DocumentTriggerType.Scheduled,
          triggerStatus: 'deployed',
          triggerHash: '123',
          configuration: {
            cronExpression: '0 * * * *',
          },
        })
        .returning()

      // Query with merged commit
      const resultAtMerged = await repo.getTriggersInDocument({
        documentUuid: document.documentUuid,
        commit: mergedCommit,
      })
      const triggersAtMerged = resultAtMerged.unwrap()

      expect(triggersAtMerged).toHaveLength(1)
      expect(triggersAtMerged[0]!.uuid).toBe(trigger!.uuid)

      // Query with draft commit
      const resultAtDraft = await repo.getTriggersInDocument({
        documentUuid: document.documentUuid,
        commit: newDraft,
      })
      const triggersAtDraft = resultAtDraft.unwrap()

      expect(triggersAtDraft).toHaveLength(2)
      expect(triggersAtDraft.map((t) => t.uuid).sort()).toEqual(
        [trigger!.uuid, newTrigger!.uuid].sort(),
      )
    })

    it('shows updated trigger from draft overriding merged one', async () => {
      // Create trigger in draft
      const [originalTrigger] = await database
        .insert(documentTriggers)
        .values({
          workspaceId: workspace.id,
          projectId: project.id,
          commitId: draft.id,
          documentUuid: document.documentUuid,
          triggerType: DocumentTriggerType.Email,
          triggerStatus: 'deployed',
          triggerHash: '123',
          configuration: {
            name: 'Original Name',
            replyWithResponse: true,
          },
        })
        .returning()

      // Merge the commit
      await mergeCommit(draft).then((r) => r.unwrap())

      // Create new draft with updated trigger
      const { commit: newDraft } = await factories.createDraft({
        project,
        user,
      })

      await database.insert(documentTriggers).values({
        uuid: originalTrigger!.uuid,
        workspaceId: workspace.id,
        projectId: project.id,
        commitId: newDraft.id,
        documentUuid: document.documentUuid,
        triggerType: DocumentTriggerType.Email,
        triggerStatus: 'deployed',
        triggerHash: '123',
        configuration: {
          name: 'Updated Name',
          replyWithResponse: false,
        },
      })

      const result = await repo.getTriggersInDocument({
        documentUuid: document.documentUuid,
        commit: newDraft,
      })
      const triggers = result.unwrap()

      expect(triggers).toHaveLength(1)
      expect(triggers[0]!.uuid).toBe(originalTrigger!.uuid)
      expect(
        (triggers[0]!.configuration as EmailTriggerConfiguration).name,
      ).toBe('Updated Name')
      expect(
        (triggers[0]!.configuration as EmailTriggerConfiguration)
          .replyWithResponse,
      ).toBe(false)
    })
  })

  describe('getTriggerByUuid', () => {
    it('returns NotFoundError when trigger does not exist', async () => {
      const result = await repo.getTriggerByUuid({ uuid: 'non-existent-uuid' })

      expect(result.ok).toBeFalsy()
      expect(result.error).toBeInstanceOf(NotFoundError)
      expect(result.error?.message).toBe(
        "Trigger with uuid 'non-existent-uuid' not found",
      )
    })

    it('returns NotFoundError with commit context when trigger not found in specific commit', async () => {
      const { commit: otherCommit } = await factories.createDraft({
        project,
        user,
      })

      const result = await repo.getTriggerByUuid({
        uuid: 'non-existent-uuid',
        commit: otherCommit,
      })

      expect(result.ok).toBeFalsy()
      expect(result.error).toBeInstanceOf(NotFoundError)
      expect(result.error?.message).toBe(
        `Trigger with uuid 'non-existent-uuid' not found in commit '${otherCommit.uuid}'`,
      )
    })

    it('returns trigger when it exists in merged commit', async () => {
      const [trigger] = await database
        .insert(documentTriggers)
        .values({
          workspaceId: workspace.id,
          projectId: project.id,
          commitId: draft.id,
          documentUuid: document.documentUuid,
          triggerType: DocumentTriggerType.Email,
          triggerStatus: 'deployed',
          triggerHash: '123',
          configuration: {
            name: 'Test Trigger',
            replyWithResponse: true,
          },
        })
        .returning()

      // Merge the commit
      await mergeCommit(draft).then((r) => r.unwrap())

      const result = await repo.getTriggerByUuid({ uuid: trigger!.uuid })

      expect(result.ok).toBeTruthy()
      const foundTrigger = result.unwrap()
      expect(foundTrigger.uuid).toBe(trigger!.uuid)
      expect(foundTrigger.documentUuid).toBe(document.documentUuid)
    })

    it('returns trigger from draft commit when specified', async () => {
      const [trigger] = await database
        .insert(documentTriggers)
        .values({
          workspaceId: workspace.id,
          projectId: project.id,
          commitId: draft.id,
          documentUuid: document.documentUuid,
          triggerType: DocumentTriggerType.Scheduled,
          triggerStatus: 'deployed',
          triggerHash: '123',
          configuration: {
            cronExpression: '0 * * * *',
          },
        })
        .returning()

      const result = await repo.getTriggerByUuid({
        uuid: trigger!.uuid,
        commit: draft,
      })

      expect(result.ok).toBeTruthy()
      const foundTrigger = result.unwrap()
      expect(foundTrigger.uuid).toBe(trigger!.uuid)
      expect(foundTrigger.commitId).toBe(draft.id)
    })

    it('returns updated trigger from draft when it overrides merged one', async () => {
      // Create trigger in draft
      const [originalTrigger] = await database
        .insert(documentTriggers)
        .values({
          workspaceId: workspace.id,
          projectId: project.id,
          commitId: draft.id,
          documentUuid: document.documentUuid,
          triggerType: DocumentTriggerType.Email,
          triggerStatus: 'deployed',
          triggerHash: '123',
          configuration: {
            name: 'Original',
            replyWithResponse: true,
          },
        })
        .returning()

      // Merge the commit
      await mergeCommit(draft).then((r) => r.unwrap())

      // Create new draft with updated trigger
      const { commit: newDraft } = await factories.createDraft({
        project,
        user,
      })

      await database.insert(documentTriggers).values({
        uuid: originalTrigger!.uuid,
        workspaceId: workspace.id,
        projectId: project.id,
        commitId: newDraft.id,
        documentUuid: document.documentUuid,
        triggerType: DocumentTriggerType.Email,
        triggerStatus: 'deployed',
        triggerHash: '123',
        configuration: {
          name: 'Updated',
          replyWithResponse: true,
        },
      })

      const result = await repo.getTriggerByUuid({
        uuid: originalTrigger!.uuid,
        commit: newDraft,
      })

      expect(result.ok).toBeTruthy()
      const foundTrigger = result.unwrap()
      expect(foundTrigger.uuid).toBe(originalTrigger!.uuid)
      expect(
        (foundTrigger.configuration as EmailTriggerConfiguration).name,
      ).toBe('Updated')
      expect(foundTrigger.commitId).toBe(newDraft.id)
    })

    it('does not return deleted triggers', async () => {
      const [trigger] = await database
        .insert(documentTriggers)
        .values({
          workspaceId: workspace.id,
          projectId: project.id,
          commitId: draft.id,
          documentUuid: document.documentUuid,
          triggerType: DocumentTriggerType.Email,
          triggerStatus: 'deployed',
          triggerHash: '123',
          configuration: {
            name: 'Test Trigger',
            replyWithResponse: true,
          },
        })
        .returning()

      // Mark as deleted
      await database
        .update(documentTriggers)
        .set({ deletedAt: new Date() })
        .where(eq(documentTriggers.id, trigger!.id))

      // Merge the commit
      await mergeCommit(draft).then((r) => r.unwrap())

      const result = await repo.getTriggerByUuid({ uuid: trigger!.uuid })

      expect(result.ok).toBeFalsy()
      expect(result.error).toBeInstanceOf(NotFoundError)
    })

    it('respects workspace scope - does not return triggers from other workspaces', async () => {
      // Create trigger in different workspace
      const {
        workspace: otherWorkspace,
        project: otherProject,
        commit: otherCommit,
        documents: otherDocuments,
      } = await factories.createProject({
        providers: [{ name: 'openai', type: Providers.OpenAI }],
        documents: {
          doc1: factories.helpers.createPrompt({ provider: 'openai' }),
        },
      })

      const [trigger] = await database
        .insert(documentTriggers)
        .values({
          workspaceId: otherWorkspace.id,
          projectId: otherProject.id,
          commitId: otherCommit.id, // Use the actual commit id
          documentUuid: otherDocuments[0]!.documentUuid,
          triggerType: DocumentTriggerType.Email,
          triggerStatus: 'deployed',
          triggerHash: '123',
          configuration: {
            name: 'Other Workspace Trigger',
            replyWithResponse: true,
          },
        })
        .returning()

      // Try to find it from current workspace repo (should fail)
      const result = await repo.getTriggerByUuid({ uuid: trigger!.uuid })

      expect(result.ok).toBeFalsy()
      expect(result.error).toBeInstanceOf(NotFoundError)
    })
  })

  describe('getAllTriggers', () => {
    it('returns all triggers in workspace excluding deleted ones', async () => {
      // Create triggers in draft commit
      const [emailTrigger] = await database
        .insert(documentTriggers)
        .values({
          workspaceId: workspace.id,
          projectId: project.id,
          commitId: draft.id,
          documentUuid: document.documentUuid,
          triggerType: DocumentTriggerType.Email,
          triggerStatus: 'deployed',
          triggerHash: '123',
          configuration: {
            name: 'Test Email Trigger',
            replyWithResponse: true,
          },
        })
        .returning()

      const [scheduledTrigger] = await database
        .insert(documentTriggers)
        .values({
          workspaceId: workspace.id,
          projectId: project.id,
          commitId: draft.id,
          documentUuid: document.documentUuid,
          triggerType: DocumentTriggerType.Scheduled,
          triggerStatus: 'deployed',
          triggerHash: '123',
          configuration: {
            cronExpression: '0 * * * *',
          },
        })
        .returning()

      // Mark one trigger as deleted
      await database
        .update(documentTriggers)
        .set({ deletedAt: new Date() })
        .where(eq(documentTriggers.id, emailTrigger!.id))

      const result = await repo.getAllTriggers()
      const triggers = result.unwrap()

      expect(triggers).toHaveLength(1)
      expect(triggers[0]!.uuid).toBe(scheduledTrigger!.uuid)
      expect(triggers[0]!.deletedAt).toBeNull()
    })

    it('returns all triggers from merged commits', async () => {
      // Create triggers in draft commit
      const [emailTrigger] = await database
        .insert(documentTriggers)
        .values({
          workspaceId: workspace.id,
          projectId: project.id,
          commitId: draft.id,
          documentUuid: document.documentUuid,
          triggerType: DocumentTriggerType.Email,
          triggerStatus: 'deployed',
          triggerHash: '123',
          configuration: {
            name: 'Test Email Trigger',
            replyWithResponse: true,
          },
        })
        .returning()

      const [scheduledTrigger] = await database
        .insert(documentTriggers)
        .values({
          workspaceId: workspace.id,
          projectId: project.id,
          commitId: draft.id,
          documentUuid: document.documentUuid,
          triggerType: DocumentTriggerType.Scheduled,
          triggerStatus: 'deployed',
          triggerHash: '123',
          configuration: {
            cronExpression: '0 * * * *',
          },
        })
        .returning()

      // Merge the commit
      await mergeCommit(draft).then((r) => r.unwrap())

      const result = await repo.getAllTriggers()
      const triggers = result.unwrap()

      expect(triggers).toHaveLength(2)
      expect(triggers.map((t) => t.uuid).sort()).toEqual(
        [emailTrigger!.uuid, scheduledTrigger!.uuid].sort(),
      )
    })

    it('includes triggers from draft commits', async () => {
      // Create triggers in draft commit
      const [emailTrigger] = await database
        .insert(documentTriggers)
        .values({
          workspaceId: workspace.id,
          projectId: project.id,
          commitId: draft.id,
          documentUuid: document.documentUuid,
          triggerType: DocumentTriggerType.Email,
          triggerStatus: 'deployed',
          triggerHash: '123',
          configuration: {
            name: 'Test Email Trigger',
            replyWithResponse: true,
          },
        })
        .returning()

      const [scheduledTrigger] = await database
        .insert(documentTriggers)
        .values({
          workspaceId: workspace.id,
          projectId: project.id,
          commitId: draft.id,
          documentUuid: document.documentUuid,
          triggerType: DocumentTriggerType.Scheduled,
          triggerStatus: 'deployed',
          triggerHash: '123',
          configuration: {
            cronExpression: '0 * * * *',
          },
        })
        .returning()

      // Don't merge the commit - keep it as draft
      const result = await repo.getAllTriggers()
      const triggers = result.unwrap()

      expect(triggers).toHaveLength(2)
      expect(triggers.map((t) => t.uuid).sort()).toEqual(
        [emailTrigger!.uuid, scheduledTrigger!.uuid].sort(),
      )
    })

    it('excludes triggers from different workspaces', async () => {
      // Create trigger in current workspace
      await database.insert(documentTriggers).values({
        workspaceId: workspace.id,
        projectId: project.id,
        commitId: draft.id,
        documentUuid: document.documentUuid,
        triggerType: DocumentTriggerType.Email,
        triggerStatus: 'deployed',
        triggerHash: '123',
        configuration: {
          name: 'Test Email Trigger',
          replyWithResponse: true,
        },
      })

      // Create trigger in different workspace
      const {
        workspace: otherWorkspace,
        project: otherProject,
        commit: otherCommit,
        documents: otherDocuments,
      } = await factories.createProject({
        providers: [{ name: 'openai4', type: Providers.OpenAI }], // Use different provider name
        documents: {
          doc1: factories.helpers.createPrompt({ provider: 'openai4' }),
        },
      })

      await database.insert(documentTriggers).values({
        workspaceId: otherWorkspace.id,
        projectId: otherProject.id,
        commitId: otherCommit.id,
        documentUuid: otherDocuments[0]!.documentUuid,
        triggerType: DocumentTriggerType.Email,
        triggerStatus: 'deployed',
        triggerHash: '123',
        configuration: {
          name: 'Other Trigger',
          replyWithResponse: true,
        },
      })

      const result = await repo.getAllTriggers()
      const triggers = result.unwrap()

      expect(triggers).toHaveLength(1)
      expect(triggers[0]!.workspaceId).toBe(workspace.id)
    })
  })

  describe('edge cases and integration scenarios', () => {
    it('handles multiple commits with same trigger UUID correctly', async () => {
      // Create trigger in draft
      const [originalTrigger] = await database
        .insert(documentTriggers)
        .values({
          workspaceId: workspace.id,
          projectId: project.id,
          commitId: draft.id,
          documentUuid: document.documentUuid,
          triggerType: DocumentTriggerType.Email,
          triggerStatus: 'deployed',
          triggerHash: '123',
          configuration: {
            name: 'Version 1',
            replyWithResponse: true,
          },
        })
        .returning()

      // Merge first commit
      const mergedCommit1 = await mergeCommit(draft).then((r) => r.unwrap())

      // Create new draft with different trigger configuration
      const { commit: draft2 } = await factories.createDraft({ project, user })

      // Add a document change to make the commit mergeable
      await updateDocument({
        commit: draft2,
        document: document,
        content: factories.helpers.createPrompt({
          provider: 'openai',
          content: 'Updated content for second draft',
        }),
      }).then((r) => r.unwrap())

      // Create a different trigger (not updating the same UUID)
      await database.insert(documentTriggers).values({
        workspaceId: workspace.id,
        projectId: project.id,
        commitId: draft2.id,
        documentUuid: document.documentUuid,
        triggerType: DocumentTriggerType.Scheduled,
        triggerStatus: 'deployed',
        triggerHash: '123',
        configuration: {
          cronExpression: '0 9 * * *',
        },
      })

      // Merge second commit
      await mergeCommit(draft2).then((r) => r.unwrap())

      // Query at different points in time
      const resultAtCommit1 = await repo.getTriggerByUuid({
        uuid: originalTrigger!.uuid,
        commit: mergedCommit1,
      })
      const triggerAtCommit1 = resultAtCommit1.unwrap()
      expect(
        (triggerAtCommit1.configuration as EmailTriggerConfiguration).name,
      ).toBe('Version 1')

      // Current state should still show the email trigger
      const resultCurrent = await repo.getTriggerByUuid({
        uuid: originalTrigger!.uuid,
      })
      const triggerCurrent = resultCurrent.unwrap()
      expect(
        (triggerCurrent.configuration as EmailTriggerConfiguration).name,
      ).toBe('Version 1')

      // Should have both triggers now
      const allTriggers = await repo.getAllActiveTriggersInWorkspace()
      expect(allTriggers.unwrap()).toHaveLength(2)
    })

    it('handles mixed trigger types correctly', async () => {
      // Create different types of triggers
      const [emailTrigger] = await database
        .insert(documentTriggers)
        .values({
          workspaceId: workspace.id,
          projectId: project.id,
          commitId: draft.id,
          documentUuid: document.documentUuid,
          triggerType: DocumentTriggerType.Email,
          triggerStatus: 'deployed',
          triggerHash: '123',
          configuration: {
            name: 'Email Trigger',
            replyWithResponse: true,
          },
        })
        .returning()

      const [scheduledTrigger] = await database
        .insert(documentTriggers)
        .values({
          workspaceId: workspace.id,
          projectId: project.id,
          commitId: draft.id,
          documentUuid: document.documentUuid,
          triggerType: DocumentTriggerType.Scheduled,
          triggerStatus: 'deployed',
          triggerHash: '123',
          configuration: {
            cronExpression: '0 * * * *',
          },
        })
        .returning()

      const [integrationTrigger] = await database
        .insert(documentTriggers)
        .values({
          workspaceId: workspace.id,
          projectId: project.id,
          commitId: draft.id,
          documentUuid: document.documentUuid,
          triggerType: DocumentTriggerType.Integration,
          triggerStatus: 'deployed',
          triggerHash: '123',
          configuration: {
            integrationId: 123,
            componentId: 'webhook-component',
            payloadParameters: ['param1', 'param2'],
          },
        })
        .returning()

      // Merge the commit
      await mergeCommit(draft).then((r) => r.unwrap())

      const allTriggers = await repo.getAllActiveTriggersInWorkspace()
      const triggers = allTriggers.unwrap()

      expect(triggers).toHaveLength(3)

      const triggerTypes = triggers.map((t) => t.triggerType).sort()
      expect(triggerTypes).toEqual([
        DocumentTriggerType.Email,
        DocumentTriggerType.Integration,
        DocumentTriggerType.Scheduled,
      ])

      // Verify each trigger can be found individually
      const emailResult = await repo.getTriggerByUuid({
        uuid: emailTrigger!.uuid,
      })
      const emailTriggerData = emailResult.unwrap()
      expect(emailTriggerData.triggerType).toBe(DocumentTriggerType.Email)

      const scheduledResult = await repo.getTriggerByUuid({
        uuid: scheduledTrigger!.uuid,
      })
      const scheduledTriggerData = scheduledResult.unwrap()
      expect(scheduledTriggerData.triggerType).toBe(
        DocumentTriggerType.Scheduled,
      )

      const integrationResult = await repo.getTriggerByUuid({
        uuid: integrationTrigger!.uuid,
      })
      const integrationTriggerData = integrationResult.unwrap()
      expect(integrationTriggerData.triggerType).toBe(
        DocumentTriggerType.Integration,
      )
    })
  })
})
