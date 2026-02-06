import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import {
  createProject,
  createExperiment,
  createEvaluationV2,
  createSpan,
  createWorkspace,
  helpers,
} from '@latitude-data/core/factories'
import { LogSources, Providers, SpanType } from '@latitude-data/constants'
import { User } from '@latitude-data/core/schema/models/types/User'
import { Workspace } from '@latitude-data/core/schema/models/types/Workspace'
import { Project } from '@latitude-data/core/schema/models/types/Project'
import { Commit } from '@latitude-data/core/schema/models/types/Commit'
import { DocumentVersion } from '@latitude-data/core/schema/models/types/DocumentVersion'
import { Experiment } from '@latitude-data/core/schema/models/types/Experiment'
import { EvaluationV2 } from '@latitude-data/core/constants'

import { GET } from './route'

const mocks = vi.hoisted(() => {
  return {
    getSession: vi.fn(),
    captureException: vi.fn(),
  }
})
vi.mock('$/services/auth/getSession', () => ({
  getSession: mocks.getSession,
}))
vi.mock('$/helpers/captureException', () => ({
  captureException: mocks.captureException,
}))

describe('GET /api/projects/[projectId]/documents/[documentUuid]/experiments/comparison', () => {
  let user: User
  let workspace: Workspace
  let project: Project
  let commit: Commit
  let document: DocumentVersion
  let evaluations: EvaluationV2[]

  beforeEach(async () => {
    const setup = await createProject({
      providers: [{ type: Providers.OpenAI, name: 'openai' }],
      documents: {
        'test-doc': helpers.createPrompt({
          provider: 'openai',
          content: 'Test content',
        }),
      },
    })
    user = setup.user
    workspace = setup.workspace
    project = setup.project
    commit = setup.commit
    document = setup.documents[0]!

    evaluations = await Promise.all([
      createEvaluationV2({
        workspace,
        commit,
        document,
        name: 'evaluation-1',
      }),
      createEvaluationV2({
        workspace,
        commit,
        document,
        name: 'evaluation-2',
      }),
    ])
  })

  function buildRequest(uuids: string[]) {
    const searchParams = new URLSearchParams()
    if (uuids.length > 0) {
      searchParams.set('uuids', uuids.join(','))
    }
    return new NextRequest(
      `http://localhost:3000/api/projects/${project.id}/documents/${document.documentUuid}/experiments/comparison?${searchParams.toString()}`,
    )
  }

  async function createTestExperiment(name: string): Promise<Experiment> {
    const { experiment } = await createExperiment({
      name,
      document,
      commit,
      evaluations,
      user,
      workspace,
    })
    return experiment
  }

  describe('unauthorized', () => {
    it('returns 401 if user is not authenticated', async () => {
      mocks.getSession.mockResolvedValue(null)
      const request = buildRequest([])

      const response = await GET(request, { workspace } as any)

      expect(response.status).toBe(401)
      expect(await response.json()).toEqual({
        message: 'Unauthorized',
      })
    })
  })

  describe('authorized', () => {
    beforeEach(() => {
      mocks.getSession.mockResolvedValue({
        user,
        session: { userId: user.id, currentWorkspaceId: workspace.id },
      })
    })

    describe('basic functionality', () => {
      it('returns empty array when no uuids provided', async () => {
        const request = buildRequest([])

        const response = await GET(request, { workspace } as any)

        expect(response.status).toBe(200)
        const data = await response.json()
        expect(data).toEqual([])
      })

      it('returns experiment with scores and run metadata', async () => {
        const experiment = await createTestExperiment('test-experiment')

        const traceId = 'trace-1'
        await createSpan({
          workspaceId: workspace.id,
          experimentUuid: experiment.uuid,
          documentUuid: document.documentUuid,
          commitUuid: commit.uuid,
          type: SpanType.Prompt,
          traceId,
          duration: 1000,
          source: LogSources.Experiment,
        })

        await createSpan({
          workspaceId: workspace.id,
          experimentUuid: experiment.uuid,
          documentUuid: document.documentUuid,
          commitUuid: commit.uuid,
          type: SpanType.Completion,
          traceId,
          cost: 100,
          tokensPrompt: 50,
          tokensCompletion: 25,
          source: LogSources.Experiment,
        })

        const request = buildRequest([experiment.uuid])

        const response = await GET(request, { workspace } as any)

        expect(response.status).toBe(200)
        const data = await response.json()
        expect(data).toHaveLength(1)
        expect(data[0]).toMatchObject({
          uuid: experiment.uuid,
          name: experiment.name,
        })
        expect(data[0].scores).toBeDefined()
        expect(data[0].runMetadata).toBeDefined()
      })

      it('returns multiple experiments when multiple uuids provided', async () => {
        const experiment1 = await createTestExperiment('experiment-1')
        const experiment2 = await createTestExperiment('experiment-2')

        const request = buildRequest([experiment1.uuid, experiment2.uuid])

        const response = await GET(request, { workspace } as any)

        expect(response.status).toBe(200)
        const data = await response.json()
        expect(data).toHaveLength(2)

        const uuids = data.map((e: any) => e.uuid)
        expect(uuids).toContain(experiment1.uuid)
        expect(uuids).toContain(experiment2.uuid)
      })
    })

    describe('getRunMetadata query logic', () => {
      it('counts Prompt spans and sums their duration', async () => {
        const experiment = await createTestExperiment('test-experiment')

        await createSpan({
          workspaceId: workspace.id,
          experimentUuid: experiment.uuid,
          documentUuid: document.documentUuid,
          commitUuid: commit.uuid,
          type: SpanType.Prompt,
          traceId: 'trace-1',
          duration: 1000,
          source: LogSources.Experiment,
        })

        await createSpan({
          workspaceId: workspace.id,
          experimentUuid: experiment.uuid,
          documentUuid: document.documentUuid,
          commitUuid: commit.uuid,
          type: SpanType.Prompt,
          traceId: 'trace-2',
          duration: 2000,
          source: LogSources.Experiment,
        })

        await createSpan({
          workspaceId: workspace.id,
          experimentUuid: experiment.uuid,
          documentUuid: document.documentUuid,
          commitUuid: commit.uuid,
          type: SpanType.Prompt,
          traceId: 'trace-3',
          duration: 3000,
          source: LogSources.Experiment,
        })

        const request = buildRequest([experiment.uuid])

        const response = await GET(request, { workspace } as any)

        expect(response.status).toBe(200)
        const data = await response.json()
        expect(data[0].runMetadata.count).toBe(3)
        expect(data[0].runMetadata.totalDuration).toBe(6000)
      })

      it('gets cost and tokens from Completion spans matching Prompt traceIds', async () => {
        const experiment = await createTestExperiment('test-experiment')

        const traceId1 = 'trace-1'
        const traceId2 = 'trace-2'

        await createSpan({
          workspaceId: workspace.id,
          experimentUuid: experiment.uuid,
          documentUuid: document.documentUuid,
          commitUuid: commit.uuid,
          type: SpanType.Prompt,
          traceId: traceId1,
          duration: 1000,
          source: LogSources.Experiment,
        })

        await createSpan({
          workspaceId: workspace.id,
          experimentUuid: experiment.uuid,
          documentUuid: document.documentUuid,
          commitUuid: commit.uuid,
          type: SpanType.Prompt,
          traceId: traceId2,
          duration: 2000,
          source: LogSources.Experiment,
        })

        await createSpan({
          workspaceId: workspace.id,
          experimentUuid: experiment.uuid,
          documentUuid: document.documentUuid,
          commitUuid: commit.uuid,
          type: SpanType.Completion,
          traceId: traceId1,
          cost: 100,
          tokensPrompt: 50,
          tokensCompletion: 25,
          source: LogSources.Experiment,
        })

        await createSpan({
          workspaceId: workspace.id,
          experimentUuid: experiment.uuid,
          documentUuid: document.documentUuid,
          commitUuid: commit.uuid,
          type: SpanType.Completion,
          traceId: traceId2,
          cost: 200,
          tokensPrompt: 100,
          tokensCompletion: 50,
          tokensCached: 10,
          tokensReasoning: 5,
          source: LogSources.Experiment,
        })

        const request = buildRequest([experiment.uuid])

        const response = await GET(request, { workspace } as any)

        expect(response.status).toBe(200)
        const data = await response.json()
        expect(data[0].runMetadata.count).toBe(2)
        expect(data[0].runMetadata.totalDuration).toBe(3000)
        expect(data[0].runMetadata.totalCost).toBe(300)
        expect(data[0].runMetadata.totalTokens).toBe(
          50 + 25 + 100 + 50 + 10 + 5,
        )
      })

      it('ignores spans that do not belong to the experiment', async () => {
        const experiment = await createTestExperiment('test-experiment')

        const traceId = 'trace-1'

        await createSpan({
          workspaceId: workspace.id,
          experimentUuid: experiment.uuid,
          documentUuid: document.documentUuid,
          commitUuid: commit.uuid,
          type: SpanType.Prompt,
          traceId,
          duration: 1000,
          source: LogSources.Experiment,
        })

        await createSpan({
          workspaceId: workspace.id,
          experimentUuid: experiment.uuid,
          documentUuid: document.documentUuid,
          commitUuid: commit.uuid,
          type: SpanType.Completion,
          traceId,
          cost: 100,
          tokensPrompt: 50,
          tokensCompletion: 25,
          source: LogSources.Experiment,
        })

        await createSpan({
          workspaceId: workspace.id,
          documentUuid: document.documentUuid,
          commitUuid: commit.uuid,
          type: SpanType.Completion,
          traceId: 'orphan-trace',
          cost: 9999,
          tokensPrompt: 9999,
          tokensCompletion: 9999,
          source: LogSources.API,
        })

        const request = buildRequest([experiment.uuid])

        const response = await GET(request, { workspace } as any)

        expect(response.status).toBe(200)
        const data = await response.json()
        expect(data[0].runMetadata.totalCost).toBe(100)
        expect(data[0].runMetadata.totalTokens).toBe(75)
      })

      it('handles multiple Completion spans per trace', async () => {
        const experiment = await createTestExperiment('test-experiment')

        const traceId = 'trace-1'

        await createSpan({
          workspaceId: workspace.id,
          experimentUuid: experiment.uuid,
          documentUuid: document.documentUuid,
          commitUuid: commit.uuid,
          type: SpanType.Prompt,
          traceId,
          duration: 1000,
          source: LogSources.Experiment,
        })

        await createSpan({
          workspaceId: workspace.id,
          experimentUuid: experiment.uuid,
          documentUuid: document.documentUuid,
          commitUuid: commit.uuid,
          type: SpanType.Completion,
          traceId,
          cost: 100,
          tokensPrompt: 50,
          tokensCompletion: 25,
          source: LogSources.Experiment,
        })

        await createSpan({
          workspaceId: workspace.id,
          experimentUuid: experiment.uuid,
          documentUuid: document.documentUuid,
          commitUuid: commit.uuid,
          type: SpanType.Completion,
          traceId,
          cost: 200,
          tokensPrompt: 100,
          tokensCompletion: 50,
          source: LogSources.Experiment,
        })

        const request = buildRequest([experiment.uuid])

        const response = await GET(request, { workspace } as any)

        expect(response.status).toBe(200)
        const data = await response.json()
        expect(data[0].runMetadata.count).toBe(1)
        expect(data[0].runMetadata.totalCost).toBe(300)
        expect(data[0].runMetadata.totalTokens).toBe(225)
      })

      it('returns zeros when no spans exist', async () => {
        const experiment = await createTestExperiment('test-experiment')

        const request = buildRequest([experiment.uuid])

        const response = await GET(request, { workspace } as any)

        expect(response.status).toBe(200)
        const data = await response.json()
        expect(data[0].runMetadata.count).toBe(0)
        expect(data[0].runMetadata.totalDuration).toBe(0)
        expect(data[0].runMetadata.totalCost).toBe(0)
        expect(data[0].runMetadata.totalTokens).toBe(0)
      })

      it('returns zeros for cost/tokens when only Prompt spans exist (no Completions)', async () => {
        const experiment = await createTestExperiment('test-experiment')

        await createSpan({
          workspaceId: workspace.id,
          experimentUuid: experiment.uuid,
          documentUuid: document.documentUuid,
          commitUuid: commit.uuid,
          type: SpanType.Prompt,
          traceId: 'trace-1',
          duration: 1000,
          source: LogSources.Experiment,
        })

        const request = buildRequest([experiment.uuid])

        const response = await GET(request, { workspace } as any)

        expect(response.status).toBe(200)
        const data = await response.json()
        expect(data[0].runMetadata.count).toBe(1)
        expect(data[0].runMetadata.totalDuration).toBe(1000)
        expect(data[0].runMetadata.totalCost).toBe(0)
        expect(data[0].runMetadata.totalTokens).toBe(0)
      })
    })

    describe('tenancy', () => {
      it('does not return experiments from another workspace', async () => {
        const experiment = await createTestExperiment('test-experiment')

        const { workspace: otherWorkspace, userData: otherUser } =
          await createWorkspace()

        mocks.getSession.mockResolvedValue({
          user: otherUser,
          session: {
            userId: otherUser.id,
            currentWorkspaceId: otherWorkspace.id,
          },
        })

        const request = buildRequest([experiment.uuid])

        const response = await GET(request, {
          workspace: otherWorkspace,
        } as any)

        expect(response.status).toBe(404)
      })

      it('does not include spans from another workspace in run metadata', async () => {
        const experiment = await createTestExperiment('test-experiment')

        const { workspace: otherWorkspace } = await createWorkspace()

        const traceId = 'trace-1'

        await createSpan({
          workspaceId: workspace.id,
          experimentUuid: experiment.uuid,
          documentUuid: document.documentUuid,
          commitUuid: commit.uuid,
          type: SpanType.Prompt,
          traceId,
          duration: 1000,
          source: LogSources.Experiment,
        })

        await createSpan({
          workspaceId: workspace.id,
          experimentUuid: experiment.uuid,
          documentUuid: document.documentUuid,
          commitUuid: commit.uuid,
          type: SpanType.Completion,
          traceId,
          cost: 100,
          tokensPrompt: 50,
          tokensCompletion: 25,
          source: LogSources.Experiment,
        })

        await createSpan({
          workspaceId: otherWorkspace.id,
          experimentUuid: experiment.uuid,
          documentUuid: document.documentUuid,
          commitUuid: commit.uuid,
          type: SpanType.Prompt,
          traceId: 'other-trace',
          duration: 9999,
          source: LogSources.Experiment,
        })

        await createSpan({
          workspaceId: otherWorkspace.id,
          experimentUuid: experiment.uuid,
          documentUuid: document.documentUuid,
          commitUuid: commit.uuid,
          type: SpanType.Completion,
          traceId: 'other-trace',
          cost: 9999,
          tokensPrompt: 9999,
          tokensCompletion: 9999,
          source: LogSources.Experiment,
        })

        const request = buildRequest([experiment.uuid])

        const response = await GET(request, { workspace } as any)

        expect(response.status).toBe(200)
        const data = await response.json()
        expect(data[0].runMetadata.count).toBe(1)
        expect(data[0].runMetadata.totalDuration).toBe(1000)
        expect(data[0].runMetadata.totalCost).toBe(100)
        expect(data[0].runMetadata.totalTokens).toBe(75)
      })
    })

    describe('error handling', () => {
      it('returns 404 when experiment does not exist', async () => {
        const request = buildRequest(['00000000-0000-0000-0000-000000000000'])

        const response = await GET(request, { workspace } as any)

        expect(response.status).toBe(404)
      })
    })
  })
})
