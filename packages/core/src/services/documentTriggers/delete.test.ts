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
import { updateDocumentTriggerConfiguration } from './update'
import {
  deleteDocumentTrigger,
  deleteAllDocumentTriggersFromCommit,
} from './delete'
import { DocumentTriggersRepository } from '../../repositories'
import { BadRequestError, NotFoundError } from '@latitude-data/constants/errors'

const mocks = vi.hoisted(() => ({
  deployDocumentTrigger: vi.fn(),
  undeployDocumentTrigger: vi.fn(),
}))

vi.mock('./deploy', () => ({
  deployDocumentTrigger: mocks.deployDocumentTrigger,
  undeployDocumentTrigger: mocks.undeployDocumentTrigger,
}))

describe.sequential('deleteDocumentTrigger', () => {
  let workspace: Workspace
  let project: Project
  let draft: Commit
  let document: DocumentVersion
  let user: User

  beforeEach(async () => {
    vi.clearAllMocks()
    vi.resetAllMocks()

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
    expect(result.error).toBeInstanceOf(BadRequestError)
    expect(result.error?.message).toBe('Cannot update a merged commit')
    expect(mocks.undeployDocumentTrigger).not.toHaveBeenCalled()
  })

  it('returns error when trigger is not found in the given commit scope', async () => {
    const result = await deleteDocumentTrigger({
      workspace,
      commit: draft,
      triggerUuid: 'non-existent-uuid',
    })

    expect(result.ok).toBeFalsy()
    expect(result.error).toBeInstanceOf(NotFoundError)
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
    expect(mocks.undeployDocumentTrigger).not.toHaveBeenCalled()

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
    const created = await createDocumentTrigger({
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

    // New draft and create a draft version (update) so undeploy path is hit
    const { commit: newDraft } = await factories.createDraft({ project, user })
    mocks.deployDocumentTrigger.mockResolvedValue(
      Result.ok({
        deploymentSettings: {},
        triggerStatus: 'deployed',
      }),
    )
    await updateDocumentTriggerConfiguration<DocumentTriggerType.Email>({
      workspace,
      commit: newDraft,
      triggerUuid: created.uuid,
      configuration: {
        name: 'E2',
        emailWhitelist: ['b@example.com'],
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

    const result = await deleteDocumentTrigger<DocumentTriggerType.Email>({
      workspace,
      commit: newDraft,
      triggerUuid: created.uuid,
    })

    expect(result.ok).toBeTruthy()
    expect(mocks.undeployDocumentTrigger).toHaveBeenCalled()
    expect(result.value).not.toBeNull()
    expect(result.value?.uuid).toBe(created.uuid)
    expect(result.value?.commitId).toBe(newDraft.id)
    expect(result.value?.deletedAt).toBeTruthy()

    const triggersScope = new DocumentTriggersRepository(workspace.id)
    const triggers = await triggersScope
      .getTriggersInDocument({
        documentUuid: document.documentUuid,
        commit: newDraft,
      })
      .then((r) => r.unwrap())
    expect(triggers.find((t) => t.uuid === created.uuid)).toBeUndefined()
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

  describe('delete all triggers from commit', () => {
    it('returns ok and hard deletes all triggers in the draft commit', async () => {
      mocks.deployDocumentTrigger.mockResolvedValue(
        Result.ok({
          deploymentSettings: {},
          triggerStatus: 'deployed',
        }),
      )
      // Create two triggers in the draft commit
      const created1 = await createDocumentTrigger({
        workspace,
        project,
        commit: draft,
        document,
        triggerType: DocumentTriggerType.Email,
        configuration: {
          name: 'Email Trigger 1',
          emailWhitelist: ['a@example.com'],
          domainWhitelist: [],
          replyWithResponse: true,
          parameters: {},
        },
      }).then((r) => r.unwrap())

      const created2 = await createDocumentTrigger({
        workspace,
        project,
        commit: draft,
        document,
        triggerType: DocumentTriggerType.Chat,
        configuration: {},
      }).then((r) => r.unwrap())

      mocks.undeployDocumentTrigger.mockResolvedValue(
        Result.ok(
          created1 as unknown as DocumentTrigger<DocumentTriggerType.Email>,
        ),
      )

      mocks.undeployDocumentTrigger.mockResolvedValue(
        Result.ok(
          created2 as unknown as DocumentTrigger<DocumentTriggerType.Chat>,
        ),
      )

      const result = await deleteAllDocumentTriggersFromCommit({
        workspace,
        commit: draft,
      })

      expect(result.ok).toBeTruthy()

      const triggersScope = new DocumentTriggersRepository(workspace.id)
      const triggers = await triggersScope
        .getTriggersInDocument({
          documentUuid: document.documentUuid,
          commit: draft,
        })
        .then((r) => r.unwrap())
      expect(triggers.find((t) => t.uuid === created1.uuid)).toBeUndefined()
      expect(triggers.find((t) => t.uuid === created2.uuid)).toBeUndefined()
    })

    it('returns ok when there are no triggers in the commit', async () => {
      const result = await deleteAllDocumentTriggersFromCommit({
        workspace,
        commit: draft,
      })
      expect(result.ok).toBeTruthy()
    })

    it('deletes only triggers in the given commit, not in other commits', async () => {
      mocks.deployDocumentTrigger.mockResolvedValue(
        Result.ok({
          deploymentSettings: {},
          triggerStatus: 'deployed',
        }),
      )

      const createdDraft = await createDocumentTrigger({
        workspace,
        project,
        commit: draft,
        document,
        triggerType: DocumentTriggerType.Email,
        configuration: {
          name: 'Draft Trigger',
          emailWhitelist: [],
          domainWhitelist: [],
          replyWithResponse: true,
          parameters: {},
        },
      }).then((r) => r.unwrap())

      // Merge draft to create a live commit
      const merged = await mergeCommit(draft).then((r) => r.unwrap())

      // Create a new draft and a trigger in the new draft
      const { commit: newDraft } = await factories.createDraft({
        project,
        user,
      })
      const createdNewDraft = await createDocumentTrigger({
        workspace,
        project,
        commit: newDraft,
        document,
        triggerType: DocumentTriggerType.Chat,
        configuration: {},
      }).then((r) => r.unwrap())

      mocks.undeployDocumentTrigger.mockResolvedValue(
        Result.ok(
          createdNewDraft as unknown as DocumentTrigger<DocumentTriggerType.Email>,
        ),
      )

      const result = await deleteAllDocumentTriggersFromCommit({
        workspace,
        commit: newDraft,
      })
      expect(result.ok).toBeTruthy()

      const triggersScope = new DocumentTriggersRepository(workspace.id)
      const triggersInNewDraft = await triggersScope
        .getTriggersInDocument({
          documentUuid: document.documentUuid,
          commit: newDraft,
        })
        .then((r) => r.unwrap())
      expect(
        triggersInNewDraft.find((t) => t.uuid === createdNewDraft.uuid),
      ).toBeUndefined()

      // The trigger in the merged commit should still exist
      const triggersInMerged = await triggersScope
        .getTriggersInDocument({
          documentUuid: document.documentUuid,
          commit: merged,
        })
        .then((r) => r.unwrap())
      expect(
        triggersInMerged.find((t) => t.uuid === createdDraft.uuid),
      ).toBeTruthy()
    })
  })
})
