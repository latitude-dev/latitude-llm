import { Job } from 'bullmq'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { HEAD_COMMIT } from '../../../constants'
import { unsafelyFindWorkspace } from '../../../data-access/workspaces'
import { Result } from '../../../lib/Result'
import { findProjectFromDocument } from '../../../queries/projects/findProjectFromDocument'
import {
  CommitsRepository,
  DocumentVersionsRepository,
  EvaluationsV2Repository,
  SpanMetadatasRepository,
  SpansRepository,
} from '../../../repositories'
import { annotateEvaluationV2 } from '../../../services/evaluationsV2/annotate'
import { captureException } from '../../../utils/datadogCapture'
import {
  annotateEvaluationV2Job,
  type AnnotateEvaluationV2JobData,
} from './annotateEvaluationV2Job'

vi.mock('../../../data-access/workspaces', () => ({
  unsafelyFindWorkspace: vi.fn(),
}))

vi.mock('../../../queries/projects/findProjectFromDocument', () => ({
  findProjectFromDocument: vi.fn(),
}))

vi.mock('../../../repositories', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../repositories')>()
  return {
    ...actual,
    CommitsRepository: vi.fn(),
    DocumentVersionsRepository: vi.fn(),
    EvaluationsV2Repository: vi.fn(),
    SpanMetadatasRepository: vi.fn(),
    SpansRepository: vi.fn(),
  }
})

vi.mock('../../../services/evaluationsV2/annotate', () => ({
  annotateEvaluationV2: vi.fn(),
}))

vi.mock('../../../utils/datadogCapture', () => ({
  captureException: vi.fn(),
}))

describe('annotateEvaluationV2Job', () => {
  const workspace = { id: 1 }
  const span = {
    id: 'span-id',
    traceId: 'trace-id',
    commitUuid: 'span-commit-uuid',
    documentUuid: 'document-uuid',
  }
  const spanMetadata = {
    traceId: 'trace-id',
    spanId: 'span-id',
    type: 'prompt',
  }
  const document = { documentUuid: 'document-uuid' }
  const project = { id: 42, name: 'Test project' }
  const commit = { id: 8, uuid: 'resolved-commit-uuid', projectId: project.id }
  const evaluation = { uuid: 'evaluation-uuid' }

  const mockFindLastMainSpanByDocumentLogUuid = vi.fn()
  const mockSpanMetadataGet = vi.fn()
  const mockGetDocumentAtCommit = vi.fn()
  const mockGetCommitByUuid = vi.fn()
  const mockGetAtCommitByDocument = vi.fn()

  function buildJobData(
    overrides: Partial<AnnotateEvaluationV2JobData> = {},
  ): AnnotateEvaluationV2JobData {
    return {
      workspaceId: workspace.id,
      conversationUuid: 'conversation-uuid',
      evaluationUuid: 'evaluation-uuid',
      score: 1,
      resultUuid: 'result-uuid',
      ...overrides,
    }
  }

  function createMockJob(
    data: AnnotateEvaluationV2JobData,
  ): Job<AnnotateEvaluationV2JobData> {
    return {
      id: 'test-job-id',
      data,
    } as Job<AnnotateEvaluationV2JobData>
  }

  beforeEach(() => {
    vi.clearAllMocks()

    vi.mocked(SpansRepository).mockImplementation(
      () =>
        ({
          findLastMainSpanByDocumentLogUuid:
            mockFindLastMainSpanByDocumentLogUuid,
        }) as unknown as SpansRepository,
    )
    vi.mocked(SpanMetadatasRepository).mockImplementation(
      () =>
        ({
          get: mockSpanMetadataGet,
        }) as unknown as SpanMetadatasRepository,
    )
    vi.mocked(DocumentVersionsRepository).mockImplementation(
      () =>
        ({
          getDocumentAtCommit: mockGetDocumentAtCommit,
        }) as unknown as DocumentVersionsRepository,
    )
    vi.mocked(CommitsRepository).mockImplementation(
      () =>
        ({
          getCommitByUuid: mockGetCommitByUuid,
        }) as unknown as CommitsRepository,
    )
    vi.mocked(EvaluationsV2Repository).mockImplementation(
      () =>
        ({
          getAtCommitByDocument: mockGetAtCommitByDocument,
        }) as unknown as EvaluationsV2Repository,
    )

    vi.mocked(unsafelyFindWorkspace).mockResolvedValue(workspace as never)
    mockFindLastMainSpanByDocumentLogUuid.mockResolvedValue(span)
    mockSpanMetadataGet.mockResolvedValue(Result.ok(spanMetadata))
    mockGetDocumentAtCommit.mockResolvedValue(Result.ok(document))
    vi.mocked(findProjectFromDocument).mockResolvedValue(project as never)
    mockGetCommitByUuid.mockResolvedValue(Result.ok(commit))
    mockGetAtCommitByDocument.mockResolvedValue(Result.ok(evaluation))
    vi.mocked(annotateEvaluationV2).mockResolvedValue(Result.ok({} as never))
  })

  it('falls back to the first project commit when resolving HEAD_COMMIT', async () => {
    const job = createMockJob(buildJobData())

    await annotateEvaluationV2Job(job)

    expect(mockGetCommitByUuid).toHaveBeenCalledWith({
      uuid: HEAD_COMMIT,
      projectId: project.id,
      includeInitialDraft: true,
    })
    expect(mockGetAtCommitByDocument).toHaveBeenCalledWith({
      commitId: commit.id,
      documentUuid: document.documentUuid,
      evaluationUuid: evaluation.uuid,
    })
    expect(annotateEvaluationV2).toHaveBeenCalledTimes(1)
    expect(captureException).not.toHaveBeenCalled()
  })

  it('does not use first-commit fallback when versionUuid is explicit', async () => {
    const explicitVersionUuid = '60810782-bc5a-4420-8fe3-cc96bb3c95e1'
    const job = createMockJob(
      buildJobData({
        versionUuid: explicitVersionUuid,
      }),
    )

    await annotateEvaluationV2Job(job)

    expect(mockGetCommitByUuid).toHaveBeenCalledWith({
      uuid: explicitVersionUuid,
      projectId: project.id,
      includeInitialDraft: false,
    })
    expect(mockGetAtCommitByDocument).toHaveBeenCalledWith({
      commitId: commit.id,
      documentUuid: document.documentUuid,
      evaluationUuid: evaluation.uuid,
    })
    expect(annotateEvaluationV2).toHaveBeenCalledTimes(1)
    expect(captureException).not.toHaveBeenCalled()
  })
})
