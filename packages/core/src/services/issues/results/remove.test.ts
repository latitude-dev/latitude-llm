import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import { env } from '@latitude-data/env'
import { Providers, SpanType } from '@latitude-data/constants'
import { eq } from 'drizzle-orm'
import { database } from '../../../client'
import { issues } from '../../../schema/models/issues'
import { issueHistograms } from '../../../schema/models/issueHistograms'
import * as factories from '../../../tests/factories'
import { waitForTransactionCallbacks } from '../../../tests/helpers'
import { removeResultFromIssue } from './remove'
import { queues } from '../../../jobs/queues'

vi.mock('../../../jobs/queues')

const originalWeaviateKey = env.WEAVIATE_API_KEY

beforeAll(() => {
  ;(env as any).WEAVIATE_API_KEY = undefined
})

afterAll(() => {
  ;(env as any).WEAVIATE_API_KEY = originalWeaviateKey
})

async function makeIssueNotNew(issueId: number) {
  const pastDate = new Date(Date.now() - 1000 * 60 * 60)
  await database
    .update(issues)
    .set({ createdAt: pastDate })
    .where(eq(issues.id, issueId))
}

describe('removeResultFromIssue', () => {
  let mockIssuesQueue: { add: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    vi.clearAllMocks()
    mockIssuesQueue = { add: vi.fn() }
    vi.mocked(queues).mockResolvedValue({
      issuesQueue: mockIssuesQueue,
    } as any)
  })

  describe('generateIssueDetailsJob', () => {
    it('queues generateIssueDetailsJob when result is NOT from an experiment', async () => {
      const { workspace, project, documents, commit } =
        await factories.createProject({
          providers: [{ type: Providers.OpenAI, name: 'openai' }],
          documents: {
            prompt: factories.helpers.createPrompt({
              provider: 'openai',
              model: 'gpt-4o',
            }),
          },
        })

      const document = documents[0]!
      const evaluation = await factories.createEvaluationV2({
        document,
        commit,
        workspace,
      })

      const span = await factories.createSpan({
        workspaceId: workspace.id,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
      })

      const result = await factories.createEvaluationResultV2({
        workspace,
        evaluation,
        commit,
        span,
        score: 0,
        normalizedScore: 0,
        hasPassed: false,
      })

      const { issue } = await factories.createIssue({
        workspace,
        project,
        document,
      })

      await makeIssueNotNew(issue.id)

      await factories.createIssueEvaluationResult({
        workspace,
        issue,
        evaluationResult: result,
      })

      await database.insert(issueHistograms).values({
        workspaceId: workspace.id,
        projectId: project.id,
        documentUuid: document.documentUuid,
        issueId: issue.id,
        commitId: commit.id,
        date: new Date().toISOString().split('T')[0]!,
        count: 2,
      })

      await removeResultFromIssue({
        result: { result, evaluation, embedding: [0.1, 0.2, 0.3] },
        issue,
        workspace,
      })

      await waitForTransactionCallbacks()

      const generateDetailsCall = mockIssuesQueue.add.mock.calls.find(
        (call) => call[0] === 'generateIssueDetailsJob',
      )
      expect(generateDetailsCall).toBeDefined()
    })

    it('does NOT queue any jobs when result is from an experiment', async () => {
      const { workspace, project, documents, commit, user } =
        await factories.createProject({
          providers: [{ type: Providers.OpenAI, name: 'openai' }],
          documents: {
            prompt: factories.helpers.createPrompt({
              provider: 'openai',
              model: 'gpt-4o',
            }),
          },
        })

      const document = documents[0]!
      const evaluation = await factories.createEvaluationV2({
        document,
        commit,
        workspace,
      })

      const { experiment } = await factories.createExperiment({
        workspace,
        user,
        document,
        commit,
        evaluations: [evaluation],
      })

      const span = await factories.createSpan({
        workspaceId: workspace.id,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
      })

      const result = await factories.createEvaluationResultV2({
        workspace,
        evaluation,
        experiment,
        commit,
        span,
        score: 0,
        normalizedScore: 0,
        hasPassed: false,
      })

      const { issue } = await factories.createIssue({
        workspace,
        project,
        document,
      })

      await makeIssueNotNew(issue.id)

      await factories.createIssueEvaluationResult({
        workspace,
        issue,
        evaluationResult: result,
      })

      await database.insert(issueHistograms).values({
        workspaceId: workspace.id,
        projectId: project.id,
        documentUuid: document.documentUuid,
        issueId: issue.id,
        commitId: commit.id,
        date: new Date().toISOString().split('T')[0]!,
        count: 2,
      })

      await removeResultFromIssue({
        result: { result, evaluation, embedding: [0.1, 0.2, 0.3] },
        issue,
        workspace,
      })

      await waitForTransactionCallbacks()

      expect(mockIssuesQueue.add).not.toHaveBeenCalled()
    })

    it('queues mergeCommonIssuesJob when result is NOT from an experiment', async () => {
      const { workspace, project, documents, commit } =
        await factories.createProject({
          providers: [{ type: Providers.OpenAI, name: 'openai' }],
          documents: {
            prompt: factories.helpers.createPrompt({
              provider: 'openai',
              model: 'gpt-4o',
            }),
          },
        })

      const document = documents[0]!
      const evaluation = await factories.createEvaluationV2({
        document,
        commit,
        workspace,
      })

      const span = await factories.createSpan({
        workspaceId: workspace.id,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
      })

      const result = await factories.createEvaluationResultV2({
        workspace,
        evaluation,
        commit,
        span,
        score: 0,
        normalizedScore: 0,
        hasPassed: false,
      })

      const { issue } = await factories.createIssue({
        workspace,
        project,
        document,
      })

      await makeIssueNotNew(issue.id)

      await factories.createIssueEvaluationResult({
        workspace,
        issue,
        evaluationResult: result,
      })

      await database.insert(issueHistograms).values({
        workspaceId: workspace.id,
        projectId: project.id,
        documentUuid: document.documentUuid,
        issueId: issue.id,
        commitId: commit.id,
        date: new Date().toISOString().split('T')[0]!,
        count: 2,
      })

      await removeResultFromIssue({
        result: { result, evaluation, embedding: [0.1, 0.2, 0.3] },
        issue,
        workspace,
      })

      await waitForTransactionCallbacks()

      const mergeCall = mockIssuesQueue.add.mock.calls.find(
        (call) => call[0] === 'mergeCommonIssuesJob',
      )
      expect(mergeCall).toBeDefined()
    })
  })
})
