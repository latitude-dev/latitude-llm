import { describe, it, expect, beforeEach, vi } from 'vitest'
import { LogSources } from '@latitude-data/constants'
import { Result } from '../../lib/Result'
import { createProject, helpers } from '../../tests/factories'
import { Providers } from '@latitude-data/constants'
import type { WorkspaceDto } from '../../schema/models/types/Workspace'
import type { Project } from '../../schema/models/types/Project'
import type { Commit } from '../../schema/models/types/Commit'
import type { DocumentVersion } from '../../schema/models/types/DocumentVersion'
import { runForegroundDocument } from './foregroundRun'
import * as runDocumentAtCommitModule from './runDocumentAtCommit'
import * as publisherModule from '../../events/publisher'
import { ProviderApiKeysRepository } from '../../repositories'

vi.spyOn(runDocumentAtCommitModule, 'runDocumentAtCommit')
vi.spyOn(publisherModule.publisher, 'publishLater')
vi.spyOn(ProviderApiKeysRepository.prototype, 'find')

describe('runForegroundDocument', () => {
  let workspace: WorkspaceDto
  let project: Project
  let commit: Commit
  let document: DocumentVersion

  beforeEach(async () => {
    vi.clearAllMocks()

    const {
      workspace: createdWorkspace,
      project: createdProject,
      commit: createdCommit,
      documents,
    } = await createProject({
      providers: [{ type: Providers.OpenAI, name: 'openai' }],
      documents: {
        doc1: helpers.createPrompt({
          provider: 'openai',
          content: 'test prompt',
        }),
      },
    })

    workspace = createdWorkspace
    project = createdProject
    commit = createdCommit
    document = documents[0]!

    const mockStream = {
      [Symbol.asyncIterator]: async function* () {
        yield { type: 'text-delta', textDelta: 'test response' }
      },
    }

    vi.mocked(runDocumentAtCommitModule.runDocumentAtCommit).mockResolvedValue(
      Result.ok({
        uuid: 'run-uuid-123',
        stream: mockStream,
        error: Promise.resolve(undefined),
        lastResponse: Promise.resolve({
          messages: [],
          response: 'test response',
          totalCost: 0.01,
          totalTokens: 10,
          totalCompletionTokens: 5,
          totalPromptTokens: 5,
          logUuid: 'log-uuid',
          documentLogUuid: 'doc-log-uuid',
          providerLog: {
            providerId: 1,
          },
        }),
      }) as any,
    )

    vi.mocked(ProviderApiKeysRepository.prototype.find).mockResolvedValue(
      Result.ok({
        id: 1,
        name: 'openai',
      }) as any,
    )

    vi.mocked(publisherModule.publisher.publishLater).mockResolvedValue(
      undefined,
    )
  })

  describe('basic execution', () => {
    it('should return stream and getFinalResponse function', async () => {
      const result = await runForegroundDocument({
        workspace,
        document,
        commit,
        project,
        parameters: { key: 'value' },
        customIdentifier: 'test-id',
        source: LogSources.API,
        tools: [],
      })

      expect(result).toHaveProperty('stream')
      expect(result).toHaveProperty('error')
      expect(result).toHaveProperty('getFinalResponse')
      expect(typeof result.getFinalResponse).toBe('function')
    })

    it('should call runDocumentAtCommit with correct parameters', async () => {
      await runForegroundDocument({
        workspace,
        document,
        commit,
        project,
        parameters: { key: 'value' },
        customIdentifier: 'test-id',
        source: LogSources.API,
        tools: ['tool1'],
        userMessage: 'test message',
      })

      expect(
        vi.mocked(runDocumentAtCommitModule.runDocumentAtCommit),
      ).toHaveBeenCalled()
      const callArgs = vi.mocked(runDocumentAtCommitModule.runDocumentAtCommit)
        .mock.calls[0][0]
      expect(callArgs.workspace).toBe(workspace)
      expect(callArgs.document).toBe(document)
      expect(callArgs.commit).toBe(commit)
      expect(callArgs.parameters).toEqual({ key: 'value' })
      expect(callArgs.customIdentifier).toBe('test-id')
      expect(callArgs.source).toBe(LogSources.API)
      expect(callArgs.userMessage).toBe('test message')
    })
  })

  describe('event publishing', () => {
    it('should publish documentRunStarted event', async () => {
      await runForegroundDocument({
        workspace,
        document,
        commit,
        project,
        parameters: { key: 'value' },
        customIdentifier: 'test-id',
        source: LogSources.API,
        tools: ['tool1'],
        userMessage: 'test message',
      })

      const calls = vi.mocked(publisherModule.publisher.publishLater).mock.calls
      const documentRunStartedCall = calls.find(
        (call) => call[0]?.type === 'documentRunStarted',
      )

      expect(documentRunStartedCall).toBeDefined()
      expect(documentRunStartedCall![0]).toMatchObject({
        type: 'documentRunStarted',
        data: expect.objectContaining({
          workspaceId: workspace.id,
          projectId: project.id,
          documentUuid: document.documentUuid,
          commitUuid: commit.uuid,
          parameters: { key: 'value' },
          customIdentifier: 'test-id',
          tools: ['tool1'],
          userMessage: 'test message',
          run: expect.objectContaining({
            uuid: 'run-uuid-123',
            source: LogSources.API,
            documentUuid: document.documentUuid,
            commitUuid: commit.uuid,
          }),
        }),
      })
    })

    it('should publish documentRunStarted event with minimal parameters', async () => {
      await runForegroundDocument({
        workspace,
        document,
        commit,
        project,
        parameters: {},
        source: LogSources.API,
        tools: [],
      })

      const calls = vi.mocked(publisherModule.publisher.publishLater).mock.calls
      const documentRunStartedCall = calls.find(
        (call) => call[0]?.type === 'documentRunStarted',
      )

      expect(documentRunStartedCall).toBeDefined()
      expect(documentRunStartedCall![0]).toMatchObject({
        type: 'documentRunStarted',
        data: expect.objectContaining({
          workspaceId: workspace.id,
          projectId: project.id,
          documentUuid: document.documentUuid,
          commitUuid: commit.uuid,
          parameters: {},
          tools: [],
        }),
      })
    })
  })

  describe('getFinalResponse', () => {
    it('should return response and provider', async () => {
      const result = await runForegroundDocument({
        workspace,
        document,
        commit,
        project,
        parameters: {},
        source: LogSources.API,
        tools: [],
      })

      const finalResponse = await result.getFinalResponse()

      expect(finalResponse).toHaveProperty('response')
      expect(finalResponse).toHaveProperty('provider')
      expect(finalResponse.response).toEqual(
        expect.objectContaining({
          response: 'test response',
          totalCost: 0.01,
        }),
      )
      expect(finalResponse.provider).toEqual({ id: 1, name: 'openai' })
    })

    it('should throw error if stream error occurs', async () => {
      const streamError = new Error('Stream failed')
      vi.mocked(
        runDocumentAtCommitModule.runDocumentAtCommit,
      ).mockResolvedValueOnce(
        Result.ok({
          uuid: 'run-uuid',
          stream: {},
          error: Promise.resolve(streamError),
          lastResponse: Promise.resolve(null),
        }) as any,
      )

      const result = await runForegroundDocument({
        workspace,
        document,
        commit,
        project,
        parameters: {},
        source: LogSources.API,
        tools: [],
      })

      await expect(result.getFinalResponse()).rejects.toThrow(streamError)
    })
  })
})
