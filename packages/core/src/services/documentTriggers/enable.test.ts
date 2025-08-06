import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DocumentTriggerType, Providers } from '@latitude-data/constants'
import {
  Commit,
  Project,
  Workspace,
  DocumentVersion,
  User,
} from '../../browser'
import { Result } from '../../lib/Result'
import * as factories from '../../tests/factories'
import { mergeCommit } from '../commits'
import { createDocumentTrigger } from './create'
import { deleteDocumentTrigger } from './delete'
import { setDocumentTriggerEnabled } from './enable'
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

describe('setDocumentTriggerEnabled', () => {
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

    // Default deploy behavior for create
    mocks.deployDocumentTrigger.mockResolvedValue(Result.ok({}))
  })

  it('returns error when commit is not live', async () => {
    const result = await setDocumentTriggerEnabled<DocumentTriggerType.Email>({
      workspace,
      commit: draft, // not live
      triggerUuid: 'any-uuid',
      enabled: true,
    })

    expect(result.ok).toBeFalsy()
    expect(result.error).toBeInstanceOf(BadRequestError)
    expect(result.error?.message).toBe(
      'A trigger can only be enabled or disabled in the Live commit',
    )
  })

  it('returns error when trigger is not found in the live commit', async () => {
    const live = await mergeCommit(draft).then((r) => r.unwrap())

    const result = await setDocumentTriggerEnabled<DocumentTriggerType.Email>({
      workspace,
      commit: live,
      triggerUuid: 'non-existent-uuid',
      enabled: true,
    })

    expect(result.ok).toBeFalsy()
    expect(result.error).toBeInstanceOf(NotFoundError)
    expect(result.error?.message).toContain(
      "Trigger with uuid 'non-existent-uuid' not found in commit",
    )
  })

  it('returns error when trying to enable a deleted trigger in live', async () => {
    // Create trigger in draft and merge so it becomes live
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
    const live1 = await mergeCommit(draft).then((r) => r.unwrap())

    // New draft where we delete the trigger
    const { commit: newDraft } = await factories.createDraft({ project, user })
    await deleteDocumentTrigger<DocumentTriggerType.Email>({
      workspace,
      commit: newDraft,
      triggerUuid: created.uuid,
    }).then((r) => r.unwrap())

    // Make a minimal document change so the merge is allowed
    await factories.updateDocumentVersion({
      document,
      commit: newDraft,
      content: 'updated content',
    })

    // Merge deletion + document change to live
    const live2 = await mergeCommit(newDraft).then((r) => r.unwrap())
    expect(live2.uuid).not.toEqual(live1.uuid)

    const result = await setDocumentTriggerEnabled<DocumentTriggerType.Email>({
      workspace,
      commit: live2,
      triggerUuid: created.uuid,
      enabled: true,
    })

    expect(result.ok).toBeFalsy()
    expect(result.error).toBeInstanceOf(NotFoundError)
    expect(result.error?.message).toContain(
      `Trigger with uuid '${created.uuid}' not found in commit`,
    )
  })

  it('returns the existing trigger when enabled state is unchanged (idempotent)', async () => {
    // Create trigger then merge to live
    const created = await createDocumentTrigger({
      workspace,
      project,
      commit: draft,
      document,
      triggerType: DocumentTriggerType.Email,
      configuration: {
        name: 'Email',
        emailWhitelist: ['a@example.com'],
        domainWhitelist: [],
        replyWithResponse: true,
        parameters: {},
      },
    }).then((r) => r.unwrap())
    const live = await mergeCommit(draft).then((r) => r.unwrap())

    const triggersScope = new DocumentTriggersRepository(workspace.id)
    const before = await triggersScope
      .getTriggerByUuid({ uuid: created.uuid, commit: live })
      .then((r) => r.unwrap())
    expect(before.enabled).toBe(false) // default disabled

    const result = await setDocumentTriggerEnabled<DocumentTriggerType.Email>({
      workspace,
      commit: live,
      triggerUuid: created.uuid,
      enabled: false,
    })

    expect(result.ok).toBeTruthy()
    const okRes = result.unwrap()
    expect(okRes.enabled).toBe(false)

    const after = await triggersScope
      .getTriggerByUuid({ uuid: created.uuid, commit: live })
      .then((r) => r.unwrap())
    expect(after.enabled).toBe(false)
  })

  it('enables and disables a live trigger', async () => {
    const created = await createDocumentTrigger({
      workspace,
      project,
      commit: draft,
      document,
      triggerType: DocumentTriggerType.Email,
      configuration: {
        name: 'Email',
        emailWhitelist: ['a@example.com'],
        domainWhitelist: [],
        replyWithResponse: true,
        parameters: {},
      },
    }).then((r) => r.unwrap())
    const live = await mergeCommit(draft).then((r) => r.unwrap())

    // Enable
    const enableResult =
      await setDocumentTriggerEnabled<DocumentTriggerType.Email>({
        workspace,
        commit: live,
        triggerUuid: created.uuid,
        enabled: true,
      })
    expect(enableResult.ok).toBeTruthy()
    expect(enableResult.unwrap().enabled).toBe(true)

    const triggersScope = new DocumentTriggersRepository(workspace.id)
    const enabledRecord = await triggersScope
      .getTriggerByUuid({ uuid: created.uuid, commit: live })
      .then((r) => r.unwrap())
    expect(enabledRecord.enabled).toBe(true)

    // Disable
    const disableResult =
      await setDocumentTriggerEnabled<DocumentTriggerType.Email>({
        workspace,
        commit: live,
        triggerUuid: created.uuid,
        enabled: false,
      })
    expect(disableResult.ok).toBeTruthy()
    expect(disableResult.unwrap().enabled).toBe(false)

    const disabledRecord = await triggersScope
      .getTriggerByUuid({ uuid: created.uuid, commit: live })
      .then((r) => r.unwrap())
    expect(disabledRecord.enabled).toBe(false)
  })
})
