import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DocumentTriggerType,
  Providers,
  IntegrationType,
} from '@latitude-data/constants'
import {
  Commit,
  Project,
  Workspace,
  DocumentVersion,
  User,
  DocumentTrigger,
} from '../../browser'
import { Result } from '../../lib/Result'
import * as factories from '../../tests/factories'
// Note: avoid static imports of modules that import `./deploy` to ensure mocks apply

const mocks: {
  deployDocumentTrigger: ReturnType<typeof vi.fn>
  undeployDocumentTrigger: ReturnType<typeof vi.fn>
} = {
  deployDocumentTrigger: vi.fn(),
  undeployDocumentTrigger: vi.fn(),
}

describe('handleTriggerMerge', () => {
  let workspace: Workspace
  let project: Project
  let draft: Commit
  let document: DocumentVersion
  let user: User

  beforeEach(async () => {
    vi.restoreAllMocks()
    mocks.deployDocumentTrigger = vi.fn()
    mocks.undeployDocumentTrigger = vi.fn()

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

    const deployModule = await import('./deploy')
    vi.spyOn(deployModule, 'deployDocumentTrigger').mockImplementation(
      mocks.deployDocumentTrigger,
    )
    vi.spyOn(deployModule, 'undeployDocumentTrigger').mockImplementation(
      mocks.undeployDocumentTrigger,
    )

    mocks.deployDocumentTrigger.mockResolvedValue(
      Result.ok({
        deploymentSettings: {},
        triggerStatus: 'deployed',
      }),
    )
  })

  it('returns error when called with a merged draft', async () => {
    const { mergeCommit } = await import('../commits')
    const { handleTriggerMerge } = await import('./handleMerge')
    const merged = await mergeCommit(draft).then((r) => r.unwrap())

    const result = await handleTriggerMerge({ workspace, draft: merged })

    expect(result.ok).toBeFalsy()
    expect(result.error?.message).toBe('Cannot merge a merged draft')
    expect(mocks.undeployDocumentTrigger).not.toHaveBeenCalled()
  })

  it('does nothing when there is no live commit (no undeploy calls)', async () => {
    const { handleTriggerMerge } = await import('./handleMerge')
    const result = await handleTriggerMerge({ workspace, draft })

    expect(result.ok).toBeTruthy()
    expect(mocks.undeployDocumentTrigger).not.toHaveBeenCalled()
  })

  it('undeploys live triggers that were updated in the draft', async () => {
    // Create two triggers and publish to live
    const { createDocumentTrigger } = await import('./create')
    const t1 = await createDocumentTrigger({
      workspace,
      project,
      commit: draft,
      document,
      triggerType: DocumentTriggerType.Email,
      configuration: {
        name: 'T1',
        emailWhitelist: ['a@example.com'],
        domainWhitelist: [],
        replyWithResponse: true,
        parameters: {},
      },
    }).then((r) => r.unwrap())

    await createDocumentTrigger({
      workspace,
      project,
      commit: draft,
      document,
      triggerType: DocumentTriggerType.Email,
      configuration: {
        name: 'T2',
        emailWhitelist: ['b@example.com'],
        domainWhitelist: [],
        replyWithResponse: true,
        parameters: {},
      },
    }).then((r) => r.unwrap())

    const { mergeCommit } = await import('../commits')
    const live = await mergeCommit(draft).then((r) => r.unwrap())

    // New draft where we update only t1
    const { commit: newDraft } = await factories.createDraft({ project, user })

    const { updateDocumentTriggerConfiguration } = await import('./update')
    await updateDocumentTriggerConfiguration<DocumentTriggerType.Email>({
      workspace,
      commit: newDraft,
      triggerUuid: t1.uuid,
      configuration: {
        name: 'T1-updated',
        emailWhitelist: ['a@example.com', 'c@example.com'],
        domainWhitelist: [],
        replyWithResponse: true,
        parameters: {},
      },
    }).then((r) => r.unwrap())

    // Prepare undeploy to succeed
    mocks.undeployDocumentTrigger.mockResolvedValue(
      Result.ok(t1 as DocumentTrigger<DocumentTriggerType.Email>),
    )

    await mergeCommit(newDraft).then((r) => r.unwrap())

    // Should undeploy only the live version of t1, not t2
    expect(mocks.undeployDocumentTrigger).toHaveBeenCalledTimes(1)
    expect(mocks.undeployDocumentTrigger).toHaveBeenCalledWith(
      {
        workspace,
        documentTrigger: expect.objectContaining({
          uuid: t1.uuid,
          commitId: live.id,
        }),
      },
      expect.any(Object),
    )
  })

  it('fails to merge when commit contains pending triggers', async () => {
    // Create an unconfigured Pipedream integration (missing connectionId)
    const { createIntegration } = await import('../../tests/factories')
    const integration = await createIntegration({
      workspace,
      type: IntegrationType.Pipedream,
      configuration: {
        appName: 'slack',
        // Missing connectionId makes it unconfigured
      },
    })

    // Create a trigger directly in the database with pending status to bypass mocks
    const { database } = await import('../../client')
    const { documentTriggers } = await import('../../schema')
    const { v4: uuidv4 } = await import('uuid')

    const triggerUuid = uuidv4()
    const [trigger] = await database
      .insert(documentTriggers)
      .values({
        uuid: triggerUuid,
        workspaceId: workspace.id,
        projectId: project.id,
        commitId: draft.id,
        documentUuid: document.documentUuid,
        triggerType: DocumentTriggerType.Integration,
        triggerStatus: 'pending', // Explicitly set to pending
        configuration: {
          integrationId: integration.id,
          componentId: 'slack.functions.send_message_to_channel',
          properties: {},
          payloadParameters: [],
        },
        deploymentSettings: null,
        enabled: false,
      })
      .returning()

    // Verify the trigger has pending status
    expect(trigger!.triggerStatus).toBe('pending')

    const { handleTriggerMerge } = await import('./handleMerge')
    const result = await handleTriggerMerge({ workspace, draft })

    expect(result.ok).toBeFalsy()
    expect(result.error?.message).toBe(
      'Cannot merge a commit that contains pending triggers',
    )
    expect(mocks.undeployDocumentTrigger).not.toHaveBeenCalled()
  })
})
