import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DocumentTriggerType, Providers } from '@latitude-data/constants'
import {
  Commit,
  Project,
  Workspace,
  DocumentTrigger,
  DocumentVersion,
  User,
} from '../../browser'
import { Result } from '../../lib/Result'
import * as factories from '../../tests/factories'
import { mergeCommit } from '../commits'
import { createDocumentTrigger } from './create'
import { DocumentTriggersRepository } from '../../repositories'

const mocks = vi.hoisted(() => ({
  deployDocumentTrigger: vi.fn(),
  undeployDocumentTrigger: vi.fn(),
  publisher: {
    publishLater: vi.fn(),
  },
}))

vi.mock('./deploy', () => ({
  deployDocumentTrigger: mocks.deployDocumentTrigger,
  undeployDocumentTrigger: mocks.undeployDocumentTrigger,
}))

vi.mock('../../events/publisher', () => ({
  publisher: mocks.publisher,
}))

vi.mock('../../events/publisher', () => ({
  publisher: mocks.publisher,
}))

describe.sequential('deleting documents...', () => {
  let workspace: Workspace
  let project: Project
  let draft: Commit
  let document: DocumentVersion
  let user: User
  let deleteDocumentTrigger: typeof import('./delete').deleteDocumentTrigger

  beforeEach(async () => {
    vi.clearAllMocks()
    vi.resetAllMocks()
    await vi.resetModules()
    const deleteModule = await import('./delete')
    deleteDocumentTrigger = deleteModule.deleteDocumentTrigger

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
  })

  it('returns error when commit is merged', async () => {
    const merged = await mergeCommit(draft).then((r) => r.unwrap())

    const result = await deleteDocumentTrigger({
      workspace,
      commit: merged,
      triggerUuid: 'any-uuid',
    })

    expect(result.ok).toBeFalsy()
    expect(result.error?.constructor.name).toBe('BadRequestError')
    expect(result.error?.message).toBe(
      'Cannot delete a trigger in a live version',
    )
    expect(mocks.undeployDocumentTrigger).not.toHaveBeenCalled()
  })

  it('returns error when trigger is not found in the given commit scope', async () => {
    const result = await deleteDocumentTrigger({
      workspace,
      commit: draft,
      triggerUuid: 'non-existent-uuid',
    })

    expect(result.ok).toBeFalsy()
    expect(result.error?.constructor.name).toBe('NotFoundError')
    expect(result.error?.message).toContain(
      "Trigger with uuid 'non-existent-uuid' not found in commit",
    )
    expect(mocks.undeployDocumentTrigger).not.toHaveBeenCalled()
  })

  it('undeploys and hard deletes when trigger was created in the same draft; returns null if no live exists', async () => {
    mocks.deployDocumentTrigger.mockResolvedValue(
      Result.ok({
        deploymentSettings: {},
        triggerStatus: 'deployed',
      }),
    )

    const created = await createDocumentTrigger({
      workspace,
      project,
      commit: draft,
      document,
      triggerType: DocumentTriggerType.Email,
      configuration: {
        name: 'Email Trigger',
        emailWhitelist: ['a@example.com'],
        domainWhitelist: [],
        replyWithResponse: true,
        parameters: {},
      },
    }).then((r) => r.unwrap())

    const deletedId = created.id

    mocks.undeployDocumentTrigger.mockResolvedValue(
      Result.ok(
        created as unknown as DocumentTrigger<DocumentTriggerType.Email>,
      ),
    )

    const result = await deleteDocumentTrigger<DocumentTriggerType.Email>({
      workspace,
      commit: draft,
      triggerUuid: created.uuid,
    })

    expect(result.ok).toBeTruthy()
    expect(result.value!.id).toBe(deletedId)

    expect(mocks.undeployDocumentTrigger).toHaveBeenCalledWith(
      {
        workspace,
        documentTrigger: expect.objectContaining({ uuid: created.uuid }),
      },
      expect.any(Object),
    )

    const triggersScope = new DocumentTriggersRepository(workspace.id)
    const triggers = await triggersScope
      .getTriggersInDocument({
        documentUuid: document.documentUuid,
        commit: draft,
      })
      .then((r) => r.unwrap())
    expect(triggers.find((t) => t.uuid === created.uuid)).toBeUndefined()
  })

  it('creates a deleted draft version when only live version exists (no undeploy)', async () => {
    // Create in draft and merge so it becomes live
    mocks.deployDocumentTrigger.mockResolvedValue(
      Result.ok({
        deploymentSettings: {},
        triggerStatus: 'deployed',
      }),
    )
    const created = await createDocumentTrigger({
      workspace,
      project,
      commit: draft,
      document,
      triggerType: DocumentTriggerType.Email,
      configuration: {
        name: 'E1',
        emailWhitelist: [],
        domainWhitelist: [],
        replyWithResponse: true,
        parameters: {},
      },
    }).then((r) => r.unwrap())
    await mergeCommit(draft).then((r) => r.unwrap())

    // New draft
    const { commit: newDraft } = await factories.createDraft({ project, user })

    mocks.undeployDocumentTrigger.mockResolvedValue(Result.ok(undefined))

    const result = await deleteDocumentTrigger<DocumentTriggerType.Email>({
      workspace,
      commit: newDraft,
      triggerUuid: created.uuid,
    })

    expect(result.ok).toBeTruthy()
    expect(result.value).not.toBeNull()
    expect(result.value?.uuid).toBe(created.uuid)
    expect(result.value?.commitId).toBe(newDraft.id)
    expect(result.value?.deletedAt).toBeTruthy()
    expect(mocks.undeployDocumentTrigger).toHaveBeenCalled()

    // Active triggers should exclude deleted ones
    const triggersScope = new DocumentTriggersRepository(workspace.id)
    const triggers = await triggersScope
      .getTriggersInDocument({
        documentUuid: document.documentUuid,
        commit: newDraft,
      })
      .then((r) => r.unwrap())
    expect(triggers.find((t) => t.uuid === created.uuid)).toBeUndefined()
  })

  it('undeploys current draft version and creates a deleted draft version when a live version also exists', async () => {
    // Create in draft and merge (live exists)
    mocks.deployDocumentTrigger.mockResolvedValue(
      Result.ok({
        deploymentSettings: {},
        triggerStatus: 'deployed',
      }),
    )
    await createDocumentTrigger({
      workspace,
      project,
      commit: draft,
      document,
      triggerType: DocumentTriggerType.Email,
      configuration: {
        name: 'E1',
        emailWhitelist: ['a@example.com'],
        domainWhitelist: [],
        replyWithResponse: true,
        parameters: {},
      },
    }).then((r) => r.unwrap())
    await mergeCommit(draft).then((r) => r.unwrap())

    // New draft and create a trigger there directly using factory
    const { commit: newDraft } = await factories.createDraft({ project, user })

    // Create a trigger in the new draft with the same UUID so it can be hard deleted
    const draftTrigger = await factories.createEmailDocumentTrigger({
      workspaceId: workspace.id,
      projectId: project.id,
      commitId: newDraft.id,
      documentUuid: document.documentUuid,
      name: 'E2',
      emailWhitelist: ['b@example.com'],
      domainWhitelist: [],
      replyWithResponse: true,
      parameters: {},
    })

    mocks.undeployDocumentTrigger.mockResolvedValue(
      Result.ok(
        draftTrigger as unknown as DocumentTrigger<DocumentTriggerType.Email>,
      ),
    )

    const result = await deleteDocumentTrigger<DocumentTriggerType.Email>({
      workspace,
      commit: newDraft,
      triggerUuid: draftTrigger.uuid,
    })

    expect(result.ok).toBeTruthy()
    expect(mocks.undeployDocumentTrigger).toHaveBeenCalled()
    expect(result.value).not.toBeNull()
    expect(result.value?.uuid).toBe(draftTrigger.uuid)
    expect(result.value?.commitId).toBe(newDraft.id)
    // When trigger is created in same commit, it should be hard deleted
    expect(result.value?.deletedAt).toBeNull()

    const triggersScope = new DocumentTriggersRepository(workspace.id)
    const triggers = await triggersScope
      .getTriggersInDocument({
        documentUuid: document.documentUuid,
        commit: newDraft,
      })
      .then((r) => r.unwrap())
    // Should be hard deleted since it was in the same commit
    expect(triggers.find((t) => t.uuid === draftTrigger.uuid)).toBeUndefined()
  })

  it('propagates undeploy error and does not delete the draft record', async () => {
    // Create in current draft
    mocks.deployDocumentTrigger.mockResolvedValue(
      Result.ok({
        deploymentSettings: {},
        triggerStatus: 'deployed',
      }),
    )
    const created = await createDocumentTrigger({
      workspace,
      project,
      commit: draft,
      document,
      triggerType: DocumentTriggerType.Email,
      configuration: {
        name: 'E1',
        emailWhitelist: [],
        domainWhitelist: [],
        replyWithResponse: true,
        parameters: {},
      },
    }).then((r) => r.unwrap())

    const undeployError = new Error('Undeploy failed')
    mocks.undeployDocumentTrigger.mockResolvedValue(Result.error(undeployError))

    const result = await deleteDocumentTrigger<DocumentTriggerType.Email>({
      workspace,
      commit: draft,
      triggerUuid: created.uuid,
    })

    expect(result.ok).toBeFalsy()
    expect(result.error).toBe(undeployError)

    const triggersScope = new DocumentTriggersRepository(workspace.id)
    const triggers = await triggersScope
      .getTriggersInDocument({
        documentUuid: document.documentUuid,
        commit: draft,
      })
      .then((r) => r.unwrap())
    // Still present since deletion did not proceed
    expect(triggers.find((t) => t.uuid === created.uuid)).toBeTruthy()
  })

  describe('event emission', () => {
    it('should emit documentTriggerDeleted event when trigger is deleted successfully', async () => {
      // Create a trigger first
      mocks.deployDocumentTrigger.mockResolvedValue(
        Result.ok({
          deploymentSettings: {},
          triggerStatus: 'deployed',
        }),
      )

      const created = await createDocumentTrigger({
        workspace,
        project,
        commit: draft,
        document,
        triggerType: DocumentTriggerType.Email,
        configuration: {
          name: 'Email Trigger',
          emailWhitelist: ['a@example.com'],
          domainWhitelist: [],
          replyWithResponse: true,
          parameters: {},
        },
      }).then((r) => r.unwrap())

      mocks.undeployDocumentTrigger.mockResolvedValue(
        Result.ok(
          created as unknown as DocumentTrigger<DocumentTriggerType.Email>,
        ),
      )

      // Act - Delete the trigger
      await deleteDocumentTrigger<DocumentTriggerType.Email>({
        workspace,
        commit: draft,
        triggerUuid: created.uuid,
      })

      // Assert
      expect(mocks.publisher.publishLater).toHaveBeenCalledWith({
        type: 'documentTriggerDeleted',
        data: {
          workspaceId: workspace.id,
          documentTrigger: expect.objectContaining({
            uuid: created.uuid,
            projectId: project.id,
            commitId: draft.id,
          }),
          projectId: project.id,
          commit: draft,
        },
      })
    })

    it('should emit documentTriggerDeleted event when trigger is hard deleted (same commit)', async () => {
      // Create a trigger in the same draft commit
      mocks.deployDocumentTrigger.mockResolvedValue(
        Result.ok({
          deploymentSettings: {},
          triggerStatus: 'deployed',
        }),
      )

      const created = await createDocumentTrigger({
        workspace,
        project,
        commit: draft,
        document,
        triggerType: DocumentTriggerType.Email,
        configuration: {
          name: 'Email Trigger',
          emailWhitelist: ['a@example.com'],
          domainWhitelist: [],
          replyWithResponse: true,
          parameters: {},
        },
      }).then((r) => r.unwrap())

      // Mock undeploy to succeed
      mocks.undeployDocumentTrigger.mockResolvedValue(
        Result.ok(
          created as unknown as DocumentTrigger<DocumentTriggerType.Email>,
        ),
      )

      // Act - Delete the trigger (same commit = hard delete)
      const result = await deleteDocumentTrigger<DocumentTriggerType.Email>({
        workspace,
        commit: draft,
        triggerUuid: created.uuid,
      })

      // Assert - Should succeed and return the deleted trigger
      expect(result.ok).toBeTruthy()
      expect(result.value).toBeTruthy()
      expect(result.value!.id).toBe(created.id)

      // Assert - Event should be published with correct data
      expect(mocks.publisher.publishLater).toHaveBeenCalledWith({
        type: 'documentTriggerDeleted',
        data: {
          workspaceId: workspace.id,
          documentTrigger: expect.objectContaining({
            id: created.id,
            uuid: created.uuid,
            projectId: project.id,
            commitId: draft.id,
          }),
          projectId: project.id,
          commit: draft,
        },
      })

      // Verify the trigger was actually hard deleted from the database
      const triggersScope = new DocumentTriggersRepository(workspace.id)
      const triggers = await triggersScope
        .getTriggersInDocument({
          documentUuid: document.documentUuid,
          commit: draft,
        })
        .then((r) => r.unwrap())

      expect(triggers.find((t) => t.uuid === created.uuid)).toBeUndefined()
    })

    it('should emit documentTriggerDeleted event when trigger is soft deleted (different commit)', async () => {
      // Create a trigger in draft and merge to make it live
      mocks.deployDocumentTrigger.mockResolvedValue(
        Result.ok({
          deploymentSettings: {},
          triggerStatus: 'deployed',
        }),
      )

      const _created = await createDocumentTrigger({
        workspace,
        project,
        commit: draft,
        document,
        triggerType: DocumentTriggerType.Email,
        configuration: {
          name: 'Email Trigger',
          emailWhitelist: ['a@example.com'],
          domainWhitelist: [],
          replyWithResponse: true,
          parameters: {},
        },
      }).then((r) => r.unwrap())

      // Merge to make it live
      await mergeCommit(draft).then((r) => r.unwrap())

      // Create new draft and create a trigger there first
      const { commit: newDraft } = await factories.createDraft({
        project,
        user,
      })

      // Mock undeploy to succeed for soft delete
      mocks.undeployDocumentTrigger.mockResolvedValue(
        Result.ok(
          _created as unknown as DocumentTrigger<DocumentTriggerType.Email>,
        ),
      )

      const result = await deleteDocumentTrigger<DocumentTriggerType.Email>({
        workspace,
        commit: newDraft,
        triggerUuid: _created.uuid,
      })

      expect(result.ok).toBeTruthy()
      expect(result.value).toBeTruthy()
      expect(result.value!.uuid).toBe(_created.uuid)
      expect(result.value!.commitId).toBe(newDraft.id)
      expect(result.value!.deletedAt).toBeTruthy()

      // Assert - Event should be published with correct data
      expect(mocks.publisher.publishLater).toHaveBeenCalledWith({
        type: 'documentTriggerDeleted',
        data: {
          workspaceId: workspace.id,
          documentTrigger: expect.objectContaining({
            uuid: _created.uuid,
            projectId: project.id,
            commitId: newDraft.id,
            deletedAt: expect.any(Date),
          }),
          projectId: project.id,
          commit: newDraft,
        },
      })
    })
  })
})
