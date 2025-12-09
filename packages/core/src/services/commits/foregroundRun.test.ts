import { describe, it, expect, beforeEach, vi } from 'vitest'
import { runForegroundDocument } from './foregroundRun'
import { LogSources } from '@latitude-data/constants'
import { Result } from '../../lib/Result'
import { createProject, helpers } from '../../tests/factories'
import { Providers } from '@latitude-data/constants'
import { DeploymentTest } from '../../schema/models/types/DeploymentTest'
import type { Workspace } from '../../schema/models/types/Workspace'
import type { Project } from '../../schema/models/types/Project'
import type { Commit } from '../../schema/models/types/Commit'
import type { DocumentVersion } from '../../schema/models/types/DocumentVersion'

const mocks = vi.hoisted(() => ({
  runDocumentAtCommit: vi.fn(),
  enqueueShadowTestChallenger: vi.fn(),
  captureException: vi.fn(),
}))

vi.mock('./runDocumentAtCommit', () => ({
  runDocumentAtCommit: mocks.runDocumentAtCommit,
}))

vi.mock('../deploymentTests/enqueueShadowTestChallenger', () => ({
  enqueueShadowTestChallenger: mocks.enqueueShadowTestChallenger,
}))

vi.mock('../../common/tracer', () => ({
  captureException: mocks.captureException,
}))

describe('runForegroundDocument', () => {
  let workspace: Workspace
  let project: Project
  let commit: Commit
  let document: DocumentVersion

  beforeEach(async () => {
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

    mocks.runDocumentAtCommit.mockResolvedValue(
      Result.ok({
        messages: [],
        response: 'test response',
        totalCost: 0.01,
        totalTokens: 10,
        totalCompletionTokens: 5,
        totalPromptTokens: 5,
        logUuid: 'log-uuid',
        documentLogUuid: 'doc-log-uuid',
      }),
    )
  })

  describe('shadow test integration', () => {
    it('should enqueue shadow test challenger when active shadow test is present', async () => {
      const shadowTest: DeploymentTest = {
        id: 1,
        uuid: 'test-uuid',
        workspaceId: workspace.id,
        projectId: project.id,
        challengerCommitId: 999,
        testType: 'shadow',
        trafficPercentage: 50,
        status: 'running',
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
        startedAt: null,
        endedAt: null,
        createdByUserId: null,
      }

      const result = await runForegroundDocument({
        workspace,
        document,
        commit,
        project,
        parameters: { key: 'value' },
        customIdentifier: 'test-id',
        source: LogSources.API,
        tools: ['tool1'],
        userMessage: 'test message',
        activeDeploymentTest: shadowTest,
      })

      await result.getFinalResponse()

      expect(mocks.enqueueShadowTestChallenger).toHaveBeenCalledWith({
        workspace,
        test: shadowTest,
        document,
        commit,
        project,
        parameters: { key: 'value' },
        customIdentifier: 'test-id',
        tools: ['tool1'],
        userMessage: 'test message',
      })
    })

    it('should not enqueue shadow test challenger when no active test', async () => {
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

      await result.getFinalResponse()

      expect(mocks.enqueueShadowTestChallenger).not.toHaveBeenCalled()
    })

    it('should capture exception when shadow test enqueue fails', async () => {
      const shadowTest: DeploymentTest = {
        id: 1,
        uuid: 'test-uuid',
        workspaceId: workspace.id,
        projectId: project.id,
        challengerCommitId: 999,
        testType: 'shadow',
        trafficPercentage: 50,
        status: 'running',
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
        startedAt: null,
        endedAt: null,
        createdByUserId: null,
      }

      const error = new Error('Failed to enqueue shadow test')
      mocks.enqueueShadowTestChallenger.mockResolvedValue(Result.error(error))

      const result = await runForegroundDocument({
        workspace,
        document,
        commit,
        project,
        parameters: {},
        source: LogSources.API,
        tools: [],
        activeDeploymentTest: shadowTest,
      })

      await result.getFinalResponse()

      expect(mocks.captureException).toHaveBeenCalledWith(error)
    })

    it('should still return response even if shadow test enqueue fails', async () => {
      const shadowTest: DeploymentTest = {
        id: 1,
        uuid: 'test-uuid',
        workspaceId: workspace.id,
        projectId: project.id,
        challengerCommitId: 999,
        testType: 'shadow',
        trafficPercentage: 50,
        status: 'running',
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
        startedAt: null,
        endedAt: null,
        createdByUserId: null,
      }

      mocks.enqueueShadowTestChallenger.mockResolvedValue(
        Result.error(new Error('Enqueue failed')),
      )

      const result = await runForegroundDocument({
        workspace,
        document,
        commit,
        project,
        parameters: {},
        source: LogSources.API,
        tools: [],
        activeDeploymentTest: shadowTest,
      })

      const response = await result.getFinalResponse()

      expect(response).toBeDefined()
      expect(mocks.runDocumentAtCommit).toHaveBeenCalled()
    })
  })
})
