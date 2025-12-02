import { beforeEach, describe, expect, it, vi } from 'vitest'

import { LogSources, Providers } from '@latitude-data/constants'
import { Result } from '../../lib/Result'
import { createProject } from '../../tests/factories'
import type { DeploymentTest } from '../../schema/models/types/DeploymentTest'
import type { Workspace } from '../../schema/models/types/Workspace'
import type { DocumentVersion } from '../../schema/models/types/DocumentVersion'
import type { Commit } from '../../schema/models/types/Commit'
import type { Project } from '../../schema/models/types/Project'
import { runForegroundDocument } from './foregroundRun'

const mocks = vi.hoisted(() => ({
  enqueueShadowTestChallenger: vi.fn(),
  captureException: vi.fn(),
}))

vi.mock('../deploymentTests/handlers/handleShadowTestRun', () => ({
  enqueueShadowTestChallenger: mocks.enqueueShadowTestChallenger,
}))

vi.mock('../../utils/datadogCapture', () => ({
  captureException: mocks.captureException,
}))

describe('runForegroundDocument', () => {
  let workspace: Workspace
  let project: Project
  let document: DocumentVersion
  let commit: Commit

  beforeEach(async () => {
    vi.clearAllMocks()

    const setup = await createProject({
      providers: [{ type: Providers.OpenAI, name: 'openai' }],
      documents: {
        'test-doc':
          '---\nprovider: openai\nmodel: gpt-4o\n---\nTest prompt content',
      },
    })

    workspace = setup.workspace
    project = setup.project
    document = setup.documents[0]!
    commit = setup.commit

    mocks.enqueueShadowTestChallenger.mockResolvedValue(Result.ok({}))
  })

  describe('shadow test integration', () => {
    it('should enqueue shadow test challenger when active shadow test is present', async () => {
      // @ts-expect-error - mock
      const shadowTest: DeploymentTest = {
        id: 1,
        uuid: 'test-uuid',
        workspaceId: workspace.id,
        projectId: project.id,
        documentUuid: document.documentUuid,
        baselineCommitId: commit.id,
        challengerCommitId: 999,
        testType: 'shadow',
        trafficPercentage: 100,
        status: 'running',
        createdAt: new Date(),
        updatedAt: new Date(),
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
        document,
        activeDeploymentTest: shadowTest,
        parameters: { key: 'value' },
        customIdentifier: 'test-id',
        tools: ['tool1'],
        userMessage: 'test message',
        commit,
        project,
      })
    })

    it('should not enqueue shadow test when activeDeploymentTest is undefined', async () => {
      const result = await runForegroundDocument({
        workspace,
        document,
        commit,
        project,
        parameters: {},
        source: LogSources.API,
        tools: [],
      })

      await result.getFinalResponse()

      expect(mocks.enqueueShadowTestChallenger).not.toHaveBeenCalled()
    })

    it('should capture exception when shadow test enqueue fails', async () => {
      // @ts-expect-error - mock
      const shadowTest: DeploymentTest = {
        id: 1,
        uuid: 'test-uuid',
        workspaceId: workspace.id,
        projectId: project.id,
        documentUuid: document.documentUuid,
        baselineCommitId: commit.id,
        challengerCommitId: 999,
        testType: 'shadow',
        trafficPercentage: 100,
        status: 'running',
        createdAt: new Date(),
        updatedAt: new Date(),
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
      // @ts-expect-error - mock
      const shadowTest: DeploymentTest = {
        id: 1,
        uuid: 'test-uuid',
        workspaceId: workspace.id,
        projectId: project.id,
        documentUuid: document.documentUuid,
        baselineCommitId: commit.id,
        challengerCommitId: 999,
        testType: 'shadow',
        trafficPercentage: 100,
        status: 'running',
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      mocks.enqueueShadowTestChallenger.mockResolvedValue(
        Result.error(new Error('Shadow test failed')),
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

      const finalResponse = await result.getFinalResponse()

      expect(finalResponse.response).toBeDefined()
      expect(mocks.captureException).toHaveBeenCalled()
    })
  })
})
