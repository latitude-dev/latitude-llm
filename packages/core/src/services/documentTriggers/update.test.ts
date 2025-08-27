import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DocumentTriggerType,
  DocumentVersion,
  Providers,
} from '@latitude-data/constants'
import {
  Commit,
  Project,
  Workspace,
  User,
  DocumentTrigger,
} from '../../browser'
import { Result } from '../../lib/Result'
import * as factories from '../../tests/factories'
import { mergeCommit } from '../commits'
import {
  EmailTriggerConfiguration,
  ScheduledTriggerConfiguration,
  IntegrationTriggerConfiguration,
  EmailTriggerDeploymentSettings,
  ScheduledTriggerDeploymentSettings,
  IntegrationTriggerDeploymentSettings,
} from '@latitude-data/constants/documentTriggers'
import { createDocumentTrigger } from './create'
import { updateDocumentTriggerConfiguration } from './update'
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

describe('updateDocumentTriggerConfiguration', () => {
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

    const result =
      await updateDocumentTriggerConfiguration<DocumentTriggerType.Email>({
        workspace,
        commit: merged,
        triggerUuid: 'any-uuid',
        configuration: { emailWhitelist: [], replyWithResponse: true },
      })

    expect(result.ok).toBeFalsy()
    expect(result.error).toBeInstanceOf(BadRequestError)
    expect(result.error?.message).toBe('Cannot update a merged commit')
    expect(mocks.deployDocumentTrigger).not.toHaveBeenCalled()
    expect(mocks.undeployDocumentTrigger).not.toHaveBeenCalled()
  })

  it('returns error when documentUuid is provided but does not exist in workspace', async () => {
    const result =
      await updateDocumentTriggerConfiguration<DocumentTriggerType.Email>({
        workspace,
        commit: draft,
        triggerUuid: 'any-uuid',
        documentUuid: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', // Valid UUID format that doesn't exist
        configuration: { emailWhitelist: [], replyWithResponse: true },
      })

    expect(result.ok).toBeFalsy()
    expect(result.error).toBeInstanceOf(NotFoundError)
    expect(result.error?.message).toContain(
      "Document with uuid 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' not found in workspace",
    )
    expect(mocks.deployDocumentTrigger).not.toHaveBeenCalled()
    expect(mocks.undeployDocumentTrigger).not.toHaveBeenCalled()
  })

  it('returns error when documentUuid belongs to a different workspace', async () => {
    // Create a document in a different workspace
    const { documents: otherDocuments } = await factories.createProject({
      providers: [{ name: 'openai', type: Providers.OpenAI }],
      documents: {
        other: factories.helpers.createPrompt({ provider: 'openai' }),
      },
    })

    const otherDocument = otherDocuments[0]!

    const result =
      await updateDocumentTriggerConfiguration<DocumentTriggerType.Email>({
        workspace,
        commit: draft,
        triggerUuid: 'any-uuid',
        documentUuid: otherDocument.documentUuid,
        configuration: { emailWhitelist: [], replyWithResponse: true },
      })

    expect(result.ok).toBeFalsy()
    expect(result.error).toBeInstanceOf(NotFoundError)
    expect(result.error?.message).toContain(
      `Document with uuid '${otherDocument.documentUuid}' not found in workspace`,
    )
    expect(mocks.deployDocumentTrigger).not.toHaveBeenCalled()
    expect(mocks.undeployDocumentTrigger).not.toHaveBeenCalled()
  })

  it('successfully updates and changes documentUuid when provided', async () => {
    const emailConfig: EmailTriggerConfiguration = {
      name: 'Email Trigger',
      emailWhitelist: ['a@example.com'],
      domainWhitelist: [],
      replyWithResponse: true,
      parameters: {},
    }
    mocks.deployDocumentTrigger.mockResolvedValue(
      Result.ok({} as EmailTriggerDeploymentSettings),
    )

    // Create initial trigger
    const created = await createDocumentTrigger({
      workspace,
      project,
      commit: draft,
      document,
      triggerType: DocumentTriggerType.Email,
      configuration: emailConfig,
    }).then((r) => r.unwrap())

    // Create a second document to assign the trigger to
    const { documentVersion: newDocument } =
      await factories.createDocumentVersion({
        workspace,
        user,
        commit: draft,
        path: 'new-document',
        content: 'New document content',
      })

    // Update with new documentUuid
    mocks.undeployDocumentTrigger.mockResolvedValue(
      Result.ok(
        created as unknown as DocumentTrigger<DocumentTriggerType.Email>,
      ),
    )
    mocks.deployDocumentTrigger.mockResolvedValueOnce(
      Result.ok({} as EmailTriggerDeploymentSettings),
    )

    const result =
      await updateDocumentTriggerConfiguration<DocumentTriggerType.Email>({
        workspace,
        commit: draft,
        triggerUuid: created.uuid,
        documentUuid: newDocument.documentUuid,
        configuration: emailConfig,
      })

    expect(result.ok).toBeTruthy()

    const triggersScope = new DocumentTriggersRepository(workspace.id)
    const triggers = await triggersScope
      .getTriggersInDocument({
        documentUuid: newDocument.documentUuid,
        commit: draft,
      })
      .then((r) => r.unwrap())
    const updatedTrigger = triggers.find((x) => x.uuid === created.uuid)!
    expect(updatedTrigger.documentUuid).toEqual(newDocument.documentUuid)
  })

  it('returns error when trigger is not found in the given commit scope', async () => {
    const result =
      await updateDocumentTriggerConfiguration<DocumentTriggerType.Email>({
        workspace,
        commit: draft,
        triggerUuid: 'non-existent-uuid',
        configuration: { emailWhitelist: [], replyWithResponse: true },
      })

    expect(result.ok).toBeFalsy()
    expect(result.error).toBeInstanceOf(NotFoundError)
    expect(result.error?.message).toContain(
      "Trigger with uuid 'non-existent-uuid' not found in commit",
    )
    expect(mocks.deployDocumentTrigger).not.toHaveBeenCalled()
    expect(mocks.undeployDocumentTrigger).not.toHaveBeenCalled()
  })

  it('returns error when trying to update a trigger from a different project', async () => {
    const emailConfig: EmailTriggerConfiguration = {
      name: 'Email Trigger',
      emailWhitelist: ['a@example.com'],
      domainWhitelist: [],
      replyWithResponse: true,
      parameters: {},
    }
    mocks.deployDocumentTrigger.mockResolvedValue(
      Result.ok({} as EmailTriggerDeploymentSettings),
    )

    // Create initial trigger in current project draft, then merge it
    const created = await createDocumentTrigger({
      workspace,
      project,
      commit: draft,
      document,
      triggerType: DocumentTriggerType.Email,
      configuration: emailConfig,
    }).then((r) => r.unwrap())
    await mergeCommit(draft).then((r) => r.unwrap())

    // Create a different project in the same workspace and a draft commit
    const { project: otherProject, commit: otherDraft } =
      await factories.createProject({
        workspace,
        providers: [{ name: 'openai-2', type: Providers.OpenAI }],
        documents: {
          bar: factories.helpers.createPrompt({ provider: 'openai' }),
        },
        skipMerge: true,
      })

    expect(otherProject.id).not.toEqual(project.id)

    const result =
      await updateDocumentTriggerConfiguration<DocumentTriggerType.Email>({
        workspace,
        commit: otherDraft,
        triggerUuid: created.uuid,
        configuration: { ...emailConfig, name: 'Updated' },
      })

    expect(result.ok).toBeFalsy()
    expect(result.error).toBeInstanceOf(NotFoundError)
    expect(result.error?.message).toContain(
      `Trigger with uuid '${created.uuid}' not found in commit '${otherDraft.uuid}'`,
    )
    expect(mocks.undeployDocumentTrigger).not.toHaveBeenCalled()
  })

  it('undeploys and redeploys when updating an existing draft trigger (same commit)', async () => {
    const emailConfig: EmailTriggerConfiguration = {
      name: 'Email Trigger',
      emailWhitelist: ['a@example.com'],
      domainWhitelist: [],
      replyWithResponse: true,
      parameters: {},
    }
    // Initial creation deploy
    mocks.deployDocumentTrigger.mockResolvedValueOnce(
      Result.ok({} as EmailTriggerDeploymentSettings),
    )

    const created = await createDocumentTrigger({
      workspace,
      project,
      commit: draft,
      document,
      triggerType: DocumentTriggerType.Email,
      configuration: emailConfig,
    }).then((r) => r.unwrap())

    // Update: expect undeploy then deploy
    mocks.undeployDocumentTrigger.mockResolvedValue(
      Result.ok(
        created as unknown as DocumentTrigger<DocumentTriggerType.Email>,
      ),
    )
    mocks.deployDocumentTrigger.mockResolvedValueOnce(
      Result.ok({} as EmailTriggerDeploymentSettings),
    )

    const updatedName = 'Updated Email Trigger'
    const result =
      await updateDocumentTriggerConfiguration<DocumentTriggerType.Email>({
        workspace,
        commit: draft,
        triggerUuid: created.uuid,
        configuration: { ...emailConfig, name: updatedName },
      })

    expect(result.ok).toBeTruthy()
    expect(mocks.undeployDocumentTrigger).toHaveBeenCalledWith(
      {
        workspace,
        documentTrigger: expect.objectContaining({ uuid: created.uuid }),
      },
      expect.any(Object),
    )
    expect(mocks.deployDocumentTrigger).toHaveBeenCalledWith(
      {
        workspace,
        commit: draft,
        triggerUuid: created.uuid,
        triggerType: DocumentTriggerType.Email,
        configuration: { ...emailConfig, name: updatedName },
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
    const t = triggers.find((x) => x.uuid === created.uuid)!
    expect(t.commitId).toEqual(draft.id)
    expect(t.enabled).toBe(false)
    expect(t.configuration).toEqual({ ...emailConfig, name: updatedName })
  })

  it('deploys a new version when updating from a merged trigger (no undeploy)', async () => {
    const emailConfig: EmailTriggerConfiguration = {
      name: 'E1',
      emailWhitelist: ['a@example.com'],
      domainWhitelist: [],
      replyWithResponse: true,
      parameters: {},
    }

    // Create in draft then merge
    mocks.deployDocumentTrigger.mockResolvedValue(
      Result.ok({} as EmailTriggerDeploymentSettings),
    )
    const created = await createDocumentTrigger({
      workspace,
      project,
      commit: draft,
      document,
      triggerType: DocumentTriggerType.Email,
      configuration: emailConfig,
    }).then((r) => r.unwrap())
    await mergeCommit(draft).then((r) => r.unwrap())

    // New draft
    const { commit: newDraft } = await factories.createDraft({ project, user })

    // For update deploy
    const newDeployment: EmailTriggerDeploymentSettings = {}
    mocks.deployDocumentTrigger.mockResolvedValue(Result.ok(newDeployment))

    const result =
      await updateDocumentTriggerConfiguration<DocumentTriggerType.Email>({
        workspace,
        commit: newDraft,
        triggerUuid: created.uuid,
        configuration: { ...emailConfig, name: 'E2' },
      })

    expect(result.ok).toBeTruthy()
    expect(mocks.undeployDocumentTrigger).not.toHaveBeenCalled()

    const triggersScope = new DocumentTriggersRepository(workspace.id)
    const triggers = await triggersScope
      .getTriggersInDocument({
        documentUuid: document.documentUuid,
        commit: newDraft,
      })
      .then((r) => r.unwrap())
    const t = triggers.find((x) => x.uuid === created.uuid)!
    expect(t.commitId).toEqual(newDraft.id)
    expect(t.configuration).toEqual({ ...emailConfig, name: 'E2' })
    expect(t.deploymentSettings).toEqual(newDeployment)
  })

  it('returns deployment error and does not create a draft version when deploy fails', async () => {
    const emailConfig: EmailTriggerConfiguration = {
      name: 'E1',
      emailWhitelist: [],
      domainWhitelist: [],
      replyWithResponse: true,
      parameters: {},
    }

    // Create initial (draft) trigger then merge
    mocks.deployDocumentTrigger.mockResolvedValue(
      Result.ok({} as EmailTriggerDeploymentSettings),
    )
    const created = await createDocumentTrigger({
      workspace,
      project,
      commit: draft,
      document,
      triggerType: DocumentTriggerType.Email,
      configuration: emailConfig,
    }).then((r) => r.unwrap())
    await mergeCommit(draft).then((r) => r.unwrap())

    // New draft
    const { commit: newDraft } = await factories.createDraft({ project, user })

    const deploymentError = new Error('Deployment failed')
    mocks.deployDocumentTrigger.mockResolvedValue(Result.error(deploymentError))

    const result =
      await updateDocumentTriggerConfiguration<DocumentTriggerType.Email>({
        workspace,
        commit: newDraft,
        triggerUuid: created.uuid,
        configuration: { ...emailConfig, name: 'E3' },
      })

    expect(result.ok).toBeFalsy()
    expect(result.error).toBe(deploymentError)

    const triggersScope = new DocumentTriggersRepository(workspace.id)
    const triggers = await triggersScope
      .getTriggersInDocument({
        documentUuid: document.documentUuid,
        commit: newDraft,
      })
      .then((r) => r.unwrap())
    const t = triggers.find((x) => x.uuid === created.uuid)!
    // Should still point to the merged version, not a new draft version
    expect(t.commitId).not.toEqual(newDraft.id)
  })

  it('updates scheduled trigger and stores deployment dates as ISO strings', async () => {
    const scheduledConfig: ScheduledTriggerConfiguration = {
      cronExpression: '0 9 * * MON-FRI',
    }

    // Create an initial scheduled trigger in draft then merge it
    const initialDeployment: ScheduledTriggerDeploymentSettings = {
      lastRun: new Date('2023-01-01T09:00:00Z'),
      nextRunTime: new Date('2023-01-02T09:00:00Z'),
    }
    mocks.deployDocumentTrigger.mockResolvedValue(Result.ok(initialDeployment))

    const created = await createDocumentTrigger({
      workspace,
      project,
      commit: draft,
      document,
      triggerType: DocumentTriggerType.Scheduled,
      configuration: scheduledConfig,
    }).then((r) => r.unwrap())
    await mergeCommit(draft).then((r) => r.unwrap())

    // New draft and new deployment with Dates
    const { commit: newDraft } = await factories.createDraft({ project, user })

    const newDeployment: ScheduledTriggerDeploymentSettings = {
      lastRun: new Date('2024-01-01T09:00:00Z'),
      nextRunTime: new Date('2024-01-02T09:00:00Z'),
    }
    mocks.deployDocumentTrigger.mockResolvedValue(Result.ok(newDeployment))

    const result =
      await updateDocumentTriggerConfiguration<DocumentTriggerType.Scheduled>({
        workspace,
        commit: newDraft,
        triggerUuid: created.uuid,
        configuration: scheduledConfig,
      })

    expect(result.ok).toBeTruthy()

    const triggersScope = new DocumentTriggersRepository(workspace.id)
    const triggers = await triggersScope
      .getTriggersInDocument({
        documentUuid: document.documentUuid,
        commit: newDraft,
      })
      .then((r) => r.unwrap())
    const t = triggers.find((x) => x.uuid === created.uuid)!
    expect(t.triggerType).toBe(DocumentTriggerType.Scheduled)
    expect(t.deploymentSettings).toEqual({
      lastRun: '2024-01-01T09:00:00.000Z',
      nextRunTime: '2024-01-02T09:00:00.000Z',
    })
  })

  it('updates integration trigger and persists deployment settings', async () => {
    // Create integration trigger in draft then merge
    const integrationConfig: IntegrationTriggerConfiguration = {
      integrationId: 1,
      componentId: 'webhook-component',
      properties: { url: 'https://api.example.com/webhook' },
      payloadParameters: ['p1'],
    }
    const initialDeployment: IntegrationTriggerDeploymentSettings = {
      triggerId: 'initial-trigger',
    }
    mocks.deployDocumentTrigger.mockResolvedValue(Result.ok(initialDeployment))

    const created = await createDocumentTrigger({
      workspace,
      project,
      commit: draft,
      document,
      triggerType: DocumentTriggerType.Integration,
      configuration: integrationConfig,
    }).then((r) => r.unwrap())
    await mergeCommit(draft).then((r) => r.unwrap())

    // New draft and new deployment settings
    const { commit: newDraft } = await factories.createDraft({ project, user })

    const newDeployment: IntegrationTriggerDeploymentSettings = {
      triggerId: 'new-external-id-456',
    }
    mocks.deployDocumentTrigger.mockResolvedValue(Result.ok(newDeployment))

    const result =
      await updateDocumentTriggerConfiguration<DocumentTriggerType.Integration>(
        {
          workspace,
          commit: newDraft,
          triggerUuid: created.uuid,
          configuration: {
            ...integrationConfig,
            payloadParameters: ['p1', 'p2'],
          },
        },
      )

    expect(result.ok).toBeTruthy()

    const triggersScope = new DocumentTriggersRepository(workspace.id)
    const triggers = await triggersScope
      .getTriggersInDocument({
        documentUuid: document.documentUuid,
        commit: newDraft,
      })
      .then((r) => r.unwrap())
    const t = triggers.find((x) => x.uuid === created.uuid)!
    expect(t.triggerType).toBe(DocumentTriggerType.Integration)
    expect(t.deploymentSettings).toEqual(newDeployment)
  })
})
