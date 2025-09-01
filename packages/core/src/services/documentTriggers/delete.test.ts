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
import { deleteDocumentTrigger } from './delete'
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
})
