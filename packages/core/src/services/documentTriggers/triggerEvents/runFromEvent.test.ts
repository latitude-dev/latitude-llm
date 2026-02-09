import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DocumentTriggerType,
  Providers,
  DocumentTriggerStatus,
} from '@latitude-data/constants'
import { type Project } from '../../../schema/models/types/Project'
import { type WorkspaceDto } from '../../../schema/models/types/Workspace'
import { type DocumentVersion } from '../../../schema/models/types/DocumentVersion'
import { type User } from '../../../schema/models/types/User'
import { Result } from '../../../lib/Result'
import * as factories from '../../../tests/factories'

const mocks = vi.hoisted(() => ({
  runDocumentAtCommit: vi.fn(),
  deployDocumentTrigger: vi.fn(),
  undeployDocumentTrigger: vi.fn(),
}))

vi.mock('../../commits', () => ({
  runDocumentAtCommit: mocks.runDocumentAtCommit,
}))

vi.mock('../deploy', () => ({
  deployDocumentTrigger: mocks.deployDocumentTrigger,
  undeployDocumentTrigger: mocks.undeployDocumentTrigger,
}))

describe('runDocumentFromTriggerEvent', () => {
  let workspace: WorkspaceDto
  let project: Project
  let user: User
  let document: DocumentVersion

  beforeEach(async () => {
    vi.clearAllMocks()

    const {
      workspace: w,
      project: p,
      user: u,
      documents,
    } = await factories.createProject({
      providers: [{ name: 'openai', type: Providers.OpenAI }],
      documents: {
        foo: factories.helpers.createPrompt({ provider: 'openai' }),
      },
    })

    workspace = w
    project = p
    user = u
    document = documents[0]!

    mocks.deployDocumentTrigger.mockResolvedValue(
      Result.ok({
        deploymentSettings: {},
        triggerStatus: 'deployed',
      }),
    )

    mocks.runDocumentAtCommit.mockResolvedValue(
      Result.ok({
        uuid: 'run-uuid',
        stream: (async function* () {})(),
        error: Promise.resolve(undefined),
        lastResponse: Promise.resolve(undefined),
        conversation: { messages: Promise.resolve([]) },
        toolCalls: Promise.resolve([]),
      }),
    )
  })

  describe('commit resolution', () => {
    it('uses the Live (head) commit when the trigger fires with an older merged commit', async () => {
      const { mergeCommit } = await import('../../commits/merge')
      const { runDocumentFromTriggerEvent } = await import('./runFromEvent')
      const { CommitsRepository } = await import('../../../repositories')

      const { commit: draft1 } = await factories.createDraft({ project, user })
      const trigger = await factories.createDocumentTrigger({
        workspace,
        project,
        commit: draft1,
        document,
        triggerType: DocumentTriggerType.Email,
        configuration: {
          name: 'Email Trigger',
          emailWhitelist: [],
          domainWhitelist: [],
          replyWithResponse: true,
          parameters: {},
        },
        triggerStatus: DocumentTriggerStatus.Deployed,
        deploymentSettings: {},
      })

      mocks.undeployDocumentTrigger.mockResolvedValue(Result.nil())
      const mergedCommit1 = await mergeCommit(draft1).then((r) => r.unwrap())

      const { commit: draft2 } = await factories.createDraft({ project, user })
      await factories.updateDocumentVersion({
        document,
        commit: draft2,
        content: factories.helpers.createPrompt({
          provider: 'openai',
          content: 'Updated prompt content v2',
        }),
      })
      const mergedCommit2 = await mergeCommit(draft2).then((r) => r.unwrap())

      const commitsRepo = new CommitsRepository(workspace.id)
      const headCommit = await commitsRepo.getHeadCommit(project.id)
      expect(headCommit!.id).toBe(mergedCommit2.id)

      const event = await factories.createDocumentTriggerEventBase({
        workspaceId: workspace.id,
        commitId: mergedCommit1.id,
        trigger,
        payload: {
          recipient: 'test@example.com',
          senderEmail: 'sender@example.com',
          subject: 'Test',
          body: 'Test body',
          attachments: [],
        },
      })

      await runDocumentFromTriggerEvent({
        workspace,
        documentTriggerEvent: event,
        commit: mergedCommit1,
      })

      expect(mocks.runDocumentAtCommit).toHaveBeenCalledTimes(1)
      const callArgs = mocks.runDocumentAtCommit.mock.calls[0]![0]
      expect(callArgs.commit.id).toBe(mergedCommit2.id)
      expect(callArgs.commit.id).not.toBe(mergedCommit1.id)
    })

    it('uses the Live commit even when the trigger fires with the same merged commit', async () => {
      const { mergeCommit } = await import('../../commits/merge')
      const { runDocumentFromTriggerEvent } = await import('./runFromEvent')
      const { CommitsRepository } = await import('../../../repositories')

      const { commit: draft1 } = await factories.createDraft({ project, user })
      const trigger = await factories.createDocumentTrigger({
        workspace,
        project,
        commit: draft1,
        document,
        triggerType: DocumentTriggerType.Email,
        configuration: {
          name: 'Email Trigger',
          emailWhitelist: [],
          domainWhitelist: [],
          replyWithResponse: true,
          parameters: {},
        },
        triggerStatus: DocumentTriggerStatus.Deployed,
        deploymentSettings: {},
      })

      mocks.undeployDocumentTrigger.mockResolvedValue(Result.nil())
      const mergedCommit1 = await mergeCommit(draft1).then((r) => r.unwrap())

      const commitsRepo = new CommitsRepository(workspace.id)
      const headCommit = await commitsRepo.getHeadCommit(project.id)
      expect(headCommit!.id).toBe(mergedCommit1.id)

      const event = await factories.createDocumentTriggerEventBase({
        workspaceId: workspace.id,
        commitId: mergedCommit1.id,
        trigger,
        payload: {
          recipient: 'test@example.com',
          senderEmail: 'sender@example.com',
          subject: 'Test',
          body: 'Test body',
          attachments: [],
        },
      })

      await runDocumentFromTriggerEvent({
        workspace,
        documentTriggerEvent: event,
        commit: mergedCommit1,
      })

      expect(mocks.runDocumentAtCommit).toHaveBeenCalledTimes(1)
      const callArgs = mocks.runDocumentAtCommit.mock.calls[0]![0]
      expect(callArgs.commit.id).toBe(mergedCommit1.id)
    })

    it('uses the draft commit as-is when the trigger fires with an unmerged commit', async () => {
      const { runDocumentFromTriggerEvent } = await import('./runFromEvent')

      const { commit: draft1 } = await factories.createDraft({ project, user })
      const trigger = await factories.createDocumentTrigger({
        workspace,
        project,
        commit: draft1,
        document,
        triggerType: DocumentTriggerType.Email,
        configuration: {
          name: 'Email Trigger',
          emailWhitelist: [],
          domainWhitelist: [],
          replyWithResponse: true,
          parameters: {},
        },
        triggerStatus: DocumentTriggerStatus.Deployed,
        deploymentSettings: {},
      })

      const event = await factories.createDocumentTriggerEventBase({
        workspaceId: workspace.id,
        commitId: draft1.id,
        trigger,
        payload: {
          recipient: 'test@example.com',
          senderEmail: 'sender@example.com',
          subject: 'Test',
          body: 'Test body',
          attachments: [],
        },
      })

      await runDocumentFromTriggerEvent({
        workspace,
        documentTriggerEvent: event,
        commit: draft1,
      })

      expect(mocks.runDocumentAtCommit).toHaveBeenCalledTimes(1)
      const callArgs = mocks.runDocumentAtCommit.mock.calls[0]![0]
      expect(callArgs.commit.id).toBe(draft1.id)
    })

    it('resolves the document at the Live commit, not the older merged commit', async () => {
      const { mergeCommit } = await import('../../commits/merge')
      const { runDocumentFromTriggerEvent } = await import('./runFromEvent')

      const { commit: draft1 } = await factories.createDraft({ project, user })
      const trigger = await factories.createDocumentTrigger({
        workspace,
        project,
        commit: draft1,
        document,
        triggerType: DocumentTriggerType.Email,
        configuration: {
          name: 'Email Trigger',
          emailWhitelist: [],
          domainWhitelist: [],
          replyWithResponse: true,
          parameters: {},
        },
        triggerStatus: DocumentTriggerStatus.Deployed,
        deploymentSettings: {},
      })

      mocks.undeployDocumentTrigger.mockResolvedValue(Result.nil())
      const mergedCommit1 = await mergeCommit(draft1).then((r) => r.unwrap())

      const updatedContent = factories.helpers.createPrompt({
        provider: 'openai',
        content: 'This is the updated prompt from v2',
      })
      const { commit: draft2 } = await factories.createDraft({ project, user })
      await factories.updateDocumentVersion({
        document,
        commit: draft2,
        content: updatedContent,
      })
      const mergedCommit2 = await mergeCommit(draft2).then((r) => r.unwrap())

      const event = await factories.createDocumentTriggerEventBase({
        workspaceId: workspace.id,
        commitId: mergedCommit1.id,
        trigger,
        payload: {
          recipient: 'test@example.com',
          senderEmail: 'sender@example.com',
          subject: 'Test',
          body: 'Test body',
          attachments: [],
        },
      })

      await runDocumentFromTriggerEvent({
        workspace,
        documentTriggerEvent: event,
        commit: mergedCommit1,
      })

      expect(mocks.runDocumentAtCommit).toHaveBeenCalledTimes(1)
      const callArgs = mocks.runDocumentAtCommit.mock.calls[0]![0]
      expect(callArgs.commit.id).toBe(mergedCommit2.id)
      expect(callArgs.document.content).toBe(updatedContent)
    })
  })
})
