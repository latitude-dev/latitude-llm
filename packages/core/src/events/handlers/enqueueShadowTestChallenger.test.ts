import { LogSources, Providers } from '@latitude-data/constants'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { Result } from '../../lib/Result'
import {
  CommitsRepository,
  DeploymentTestsRepository,
  DocumentVersionsRepository,
  ProjectsRepository,
} from '../../repositories'
import { unsafelyFindWorkspace } from '../../data-access/workspaces'
import { enqueueRun } from '../../services/runs/enqueue'
import { routeRequest } from '../../services/deploymentTests/routeRequest'
import { captureException } from '../../utils/datadogCapture'
import { DocumentRunStartedEvent } from '../events'
import { enqueueShadowTestChallengerHandler } from './enqueueShadowTestChallenger'
import { createProject, helpers } from '../../tests/factories'
import { type DeploymentTest } from '../../schema/models/types/DeploymentTest'
import { type Commit } from '../../schema/models/types/Commit'
import { type DocumentVersion } from '../../schema/models/types/DocumentVersion'
import { type Project } from '../../schema/models/types/Project'
import { type Workspace } from '../../schema/models/types/Workspace'

vi.mock('../../repositories', () => ({
  CommitsRepository: vi.fn(),
  DeploymentTestsRepository: vi.fn(),
  DocumentVersionsRepository: vi.fn(),
  ProjectsRepository: vi.fn(),
}))

vi.mock('../../data-access/workspaces', () => ({
  unsafelyFindWorkspace: vi.fn(),
}))

vi.mock('../../services/runs/enqueue', () => ({
  enqueueRun: vi.fn(),
}))

vi.mock('../../services/deploymentTests/routeRequest', () => ({
  routeRequest: vi.fn(),
}))

vi.mock('../../utils/datadogCapture', () => ({
  captureException: vi.fn(),
}))

describe('enqueueShadowTestChallengerHandler', () => {
  let workspace: Workspace
  let project: Project
  let commit: Commit
  let challengerCommit: Commit
  let document: DocumentVersion
  let shadowTest: DeploymentTest

  const mockDeploymentTestsRepo = {
    findAllActiveForProject: vi.fn(),
  }

  const mockCommitsRepo = {
    getHeadCommit: vi.fn(),
    getCommitByUuid: vi.fn(),
    getCommitById: vi.fn(),
  }

  const mockDocumentsRepo = {
    getDocumentByUuid: vi.fn(),
  }

  const mockProjectsRepo = {
    getProjectById: vi.fn(),
  }

  beforeAll(async () => {
    const projectData = await createProject({
      providers: [
        {
          type: Providers.OpenAI,
          name: 'openai',
        },
      ],
      documents: {
        doc: helpers.createPrompt({ provider: 'openai' }),
      },
    })
    workspace = projectData.workspace
    project = projectData.project
    commit = projectData.commit
    document = projectData.documents[0]!

    // Create a mock challenger commit
    challengerCommit = {
      ...commit,
      id: commit.id + 1,
      uuid: 'challenger-commit-uuid',
    } as Commit

    // Create a mock shadow test
    shadowTest = {
      id: 1,
      uuid: 'shadow-test-uuid',
      workspaceId: workspace.id,
      projectId: project.id,
      testType: 'shadow',
      status: 'running',
      challengerCommitId: challengerCommit.id,
      baselineCommitId: commit.id,
      trafficPercentage: 50,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    } as unknown as DeploymentTest
  })

  beforeEach(() => {
    vi.clearAllMocks()

    vi.mocked(DeploymentTestsRepository).mockImplementation(
      () => mockDeploymentTestsRepo as any,
    )
    vi.mocked(CommitsRepository).mockImplementation(
      () => mockCommitsRepo as any,
    )
    vi.mocked(DocumentVersionsRepository).mockImplementation(
      () => mockDocumentsRepo as any,
    )
    vi.mocked(ProjectsRepository).mockImplementation(
      () => mockProjectsRepo as any,
    )
  })

  const createEvent = (
    overrides?: Partial<DocumentRunStartedEvent['data']>,
  ) => {
    return {
      type: 'documentRunStarted' as const,
      data: {
        workspaceId: workspace.id,
        projectId: project.id,
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        parameters: {},
        customIdentifier: null,
        tools: [],
        userMessage: undefined,
        run: {
          uuid: 'run-uuid',
          queuedAt: new Date(),
          source: LogSources.API,
          documentUuid: document.documentUuid,
          commitUuid: commit.uuid,
        },
        ...overrides,
      },
    } as DocumentRunStartedEvent
  }

  describe('infinite recursion prevention', () => {
    it('should not trigger shadow test run when source is ShadowTest', async () => {
      const event = createEvent({
        run: {
          uuid: 'run-uuid',
          queuedAt: new Date(),
          source: LogSources.ShadowTest,
          documentUuid: document.documentUuid,
          commitUuid: commit.uuid,
        },
      })

      await enqueueShadowTestChallengerHandler({ data: event })

      expect(
        mockDeploymentTestsRepo.findAllActiveForProject,
      ).not.toHaveBeenCalled()
      expect(enqueueRun).not.toHaveBeenCalled()
    })
  })

  describe('when no shadow test exists', () => {
    it('should return early if no active shadow test exists', async () => {
      mockDeploymentTestsRepo.findAllActiveForProject.mockResolvedValue([])

      const event = createEvent()
      await enqueueShadowTestChallengerHandler({ data: event })

      expect(
        mockDeploymentTestsRepo.findAllActiveForProject,
      ).toHaveBeenCalledWith(project.id)
      expect(enqueueRun).not.toHaveBeenCalled()
    })

    it('should return early if only A/B test exists (not shadow)', async () => {
      const abTest = {
        ...shadowTest,
        testType: 'ab' as const,
      }
      mockDeploymentTestsRepo.findAllActiveForProject.mockResolvedValue([
        abTest,
      ])

      const event = createEvent()
      await enqueueShadowTestChallengerHandler({ data: event })

      expect(enqueueRun).not.toHaveBeenCalled()
    })
  })

  describe('when commit is not relevant', () => {
    beforeEach(() => {
      mockDeploymentTestsRepo.findAllActiveForProject.mockResolvedValue([
        shadowTest,
      ])
      mockCommitsRepo.getHeadCommit.mockResolvedValue(commit)
    })

    it('should return early if commit is neither head nor challenger', async () => {
      const otherCommit = {
        ...commit,
        id: commit.id + 100,
        uuid: 'other-commit-uuid',
      } as Commit

      mockCommitsRepo.getCommitByUuid.mockResolvedValue(Result.ok(otherCommit))

      const event = createEvent({ commitUuid: otherCommit.uuid })
      await enqueueShadowTestChallengerHandler({ data: event })

      expect(mockCommitsRepo.getCommitByUuid).toHaveBeenCalledWith({
        uuid: otherCommit.uuid,
        projectId: project.id,
      })
      expect(enqueueRun).not.toHaveBeenCalled()
    })

    it('should handle error when getting commit fails', async () => {
      const error = new Error('Failed to get commit')
      mockCommitsRepo.getCommitByUuid.mockResolvedValue(Result.error(error))

      const event = createEvent()
      await enqueueShadowTestChallengerHandler({ data: event })

      expect(captureException).toHaveBeenCalledWith(error)
      expect(enqueueRun).not.toHaveBeenCalled()
    })
  })

  describe('when routing does not go to challenger', () => {
    beforeEach(() => {
      mockDeploymentTestsRepo.findAllActiveForProject.mockResolvedValue([
        shadowTest,
      ])
      mockCommitsRepo.getHeadCommit.mockResolvedValue(commit)
      mockCommitsRepo.getCommitByUuid.mockResolvedValue(Result.ok(commit))
    })

    it('should return early if routed to baseline', async () => {
      vi.mocked(routeRequest).mockReturnValue('baseline')

      const event = createEvent()
      await enqueueShadowTestChallengerHandler({ data: event })

      expect(routeRequest).toHaveBeenCalledWith(shadowTest, undefined)
      expect(enqueueRun).not.toHaveBeenCalled()
    })
  })

  describe('when fetching data fails', () => {
    beforeEach(() => {
      mockDeploymentTestsRepo.findAllActiveForProject.mockResolvedValue([
        shadowTest,
      ])
      mockCommitsRepo.getHeadCommit.mockResolvedValue(commit)
      mockCommitsRepo.getCommitByUuid.mockResolvedValue(Result.ok(commit))
      vi.mocked(routeRequest).mockReturnValue('challenger')
      // @ts-expect-error: mockResolvedValue is not typed correctly
      vi.mocked(unsafelyFindWorkspace).mockResolvedValue(workspace)
    })

    it('should handle error when fetching challenger commit fails', async () => {
      const error = new Error('Failed to get challenger commit')
      mockCommitsRepo.getCommitById.mockResolvedValue(Result.error(error))
      mockProjectsRepo.getProjectById.mockResolvedValue(Result.ok(project))
      mockDocumentsRepo.getDocumentByUuid.mockResolvedValue(Result.ok(document))

      const event = createEvent()
      await enqueueShadowTestChallengerHandler({ data: event })

      expect(captureException).toHaveBeenCalledWith(error)
      expect(enqueueRun).not.toHaveBeenCalled()
    })

    it('should handle error when fetching project fails', async () => {
      mockCommitsRepo.getCommitById.mockResolvedValue(
        Result.ok(challengerCommit),
      )
      const error = new Error('Failed to get project')
      mockProjectsRepo.getProjectById.mockResolvedValue(Result.error(error))
      mockDocumentsRepo.getDocumentByUuid.mockResolvedValue(Result.ok(document))

      const event = createEvent()
      await enqueueShadowTestChallengerHandler({ data: event })

      expect(captureException).toHaveBeenCalledWith(error)
      expect(enqueueRun).not.toHaveBeenCalled()
    })

    it('should handle error when fetching document fails', async () => {
      mockCommitsRepo.getCommitById.mockResolvedValue(
        Result.ok(challengerCommit),
      )
      mockProjectsRepo.getProjectById.mockResolvedValue(Result.ok(project))
      const error = new Error('Failed to get document')
      mockDocumentsRepo.getDocumentByUuid.mockResolvedValue(Result.error(error))

      const event = createEvent()
      await enqueueShadowTestChallengerHandler({ data: event })

      expect(captureException).toHaveBeenCalledWith(error)
      expect(enqueueRun).not.toHaveBeenCalled()
    })
  })

  describe('successful shadow test enqueue', () => {
    beforeEach(() => {
      mockDeploymentTestsRepo.findAllActiveForProject.mockResolvedValue([
        shadowTest,
      ])
      mockCommitsRepo.getHeadCommit.mockResolvedValue(commit)
      mockCommitsRepo.getCommitByUuid.mockResolvedValue(Result.ok(commit))
      mockCommitsRepo.getCommitById.mockResolvedValue(
        Result.ok(challengerCommit),
      )
      mockProjectsRepo.getProjectById.mockResolvedValue(Result.ok(project))
      mockDocumentsRepo.getDocumentByUuid.mockResolvedValue(Result.ok(document))
      vi.mocked(routeRequest).mockReturnValue('challenger')
      // @ts-expect-error: mockResolvedValue is not typed correctly
      vi.mocked(unsafelyFindWorkspace).mockResolvedValue(workspace)
      vi.mocked(enqueueRun).mockResolvedValue(Result.ok({ run: {} as any }))
    })

    it('should enqueue shadow test run when commit is head commit', async () => {
      const event = createEvent()
      await enqueueShadowTestChallengerHandler({ data: event })

      expect(enqueueRun).toHaveBeenCalledWith({
        workspace,
        document,
        commit: challengerCommit,
        project,
        parameters: {},
        customIdentifier: undefined,
        tools: [],
        userMessage: undefined,
        source: LogSources.ShadowTest,
        simulationSettings: { simulateToolResponses: true },
        activeDeploymentTest: shadowTest,
      })
    })

    it('should enqueue shadow test run when commit is challenger commit', async () => {
      mockCommitsRepo.getHeadCommit.mockResolvedValue({
        ...commit,
        id: commit.id + 10,
      } as Commit)
      mockCommitsRepo.getCommitByUuid.mockResolvedValue(
        Result.ok(challengerCommit),
      )

      const event = createEvent({ commitUuid: challengerCommit.uuid })
      await enqueueShadowTestChallengerHandler({ data: event })

      expect(enqueueRun).toHaveBeenCalled()
    })

    it('should pass through parameters, customIdentifier, tools, and userMessage', async () => {
      const parameters = { key: 'value' }
      const customIdentifier = 'custom-id'
      const tools = ['tool1', 'tool2']
      const userMessage = 'user message'

      const event = createEvent({
        parameters,
        customIdentifier,
        tools,
        userMessage,
      })
      await enqueueShadowTestChallengerHandler({ data: event })

      expect(enqueueRun).toHaveBeenCalledWith(
        expect.objectContaining({
          parameters,
          customIdentifier,
          tools,
          userMessage,
        }),
      )
    })

    it('should handle enqueueRun failure gracefully', async () => {
      const error = new Error('Failed to enqueue run')
      vi.mocked(enqueueRun).mockResolvedValue(Result.error(error))

      const event = createEvent()
      await enqueueShadowTestChallengerHandler({ data: event })

      expect(captureException).toHaveBeenCalledWith(error)
    })
  })
})
