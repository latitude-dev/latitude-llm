import { NotFoundError } from '@latitude-data/constants/errors'
import { Job } from 'bullmq'
import {
  HEAD_COMMIT,
  MainSpanMetadata,
  MainSpanType,
  SpanWithDetails,
} from '../../../constants'
import { unsafelyFindWorkspace } from '../../../data-access/workspaces'
import { isRetryableError } from '../../../lib/isRetryableError'
import {
  CommitsRepository,
  DocumentVersionsRepository,
  EvaluationsV2Repository,
  SpanMetadatasRepository,
  SpansRepository,
} from '../../../repositories'
import { findProjectFromDocument } from '../../../queries/projects/findProjectFromDocument'
import { annotateEvaluationV2 } from '../../../services/evaluationsV2/annotate'
import { captureException } from '../../../utils/datadogCapture'

type AnnotationContext = {
  messageIndex: number
  contentBlockIndex: number
  contentType:
    | 'text'
    | 'reasoning'
    | 'image'
    | 'file'
    | 'tool-call'
    | 'tool-result'
}

export type AnnotateEvaluationV2JobData = {
  workspaceId: number
  conversationUuid: string
  evaluationUuid: string
  score: number
  versionUuid?: string
  metadata?: {
    reason: string
  }
  context?: AnnotationContext
  resultUuid: string
  isUpdate?: boolean
}

export async function annotateEvaluationV2Job(
  job: Job<AnnotateEvaluationV2JobData>,
) {
  const {
    workspaceId,
    conversationUuid,
    evaluationUuid,
    score,
    metadata: resultMetadata,
    context,
    resultUuid,
    isUpdate,
    versionUuid,
  } = job.data

  try {
    const workspace = await unsafelyFindWorkspace(workspaceId)
    if (!workspace)
      throw new NotFoundError(`Workspace not found ${workspaceId}`)

    const evaluationsRepo = new EvaluationsV2Repository(workspace.id)
    const spansRepo = new SpansRepository(workspace.id)
    const spanMetadataRepo = new SpanMetadatasRepository(workspace.id)

    const span =
      await spansRepo.findLastMainSpanByDocumentLogUuid(conversationUuid)
    if (!span) {
      throw new NotFoundError(
        `Could not find span with uuid ${conversationUuid}`,
      )
    }

    const metadata = (await spanMetadataRepo
      .get({
        traceId: span.traceId,
        spanId: span.id,
      })
      .then((r) => r.value)) as MainSpanMetadata
    if (!metadata) {
      throw new NotFoundError('Could not find metadata for this span')
    }

    if (!span.commitUuid || !span.documentUuid) {
      throw new NotFoundError('Span is missing document or commit information')
    }

    const documentsRepo = new DocumentVersionsRepository(workspace.id)
    const document = await documentsRepo
      .getDocumentAtCommit({
        commitUuid: span.commitUuid,
        documentUuid: span.documentUuid,
      })
      .then((r) => r.value)
    if (!document) {
      throw new NotFoundError('Could not find prompt for this log')
    }

    const project = await findProjectFromDocument({ document })
    if (!project) {
      throw new NotFoundError('Could not find project for this document')
    }

    const commitsRepo = new CommitsRepository(workspace.id)
    const resolvedVersionUuid = versionUuid ?? HEAD_COMMIT
    const shouldFallbackToInitialDraft = resolvedVersionUuid === HEAD_COMMIT
    const commit = await commitsRepo
      .getCommitByUuid({
        uuid: resolvedVersionUuid,
        projectId: project.id,
        includeInitialDraft: shouldFallbackToInitialDraft,
      })
      .then((r) => r.unwrap())
    if (!commit) {
      throw new NotFoundError(
        `Could not find version ${resolvedVersionUuid} in project ${project.name}`,
      )
    }

    const evaluation = await evaluationsRepo
      .getAtCommitByDocument({
        commitId: commit.id,
        documentUuid: document.documentUuid,
        evaluationUuid,
      })
      .then((r) => r.unwrap())
    if (!evaluation) {
      throw new NotFoundError('Could not find evaluation for this version')
    }

    await annotateEvaluationV2({
      span: { ...span, metadata } as SpanWithDetails<MainSpanType>,
      evaluation,
      resultScore: score,
      resultMetadata: {
        ...resultMetadata,
        selectedContexts: context ? [context] : undefined,
      },
      commit,
      workspace,
      resultUuid,
      isUpdate,
    }).then((r) => r.unwrap())
  } catch (error) {
    if (isRetryableError(error as Error)) throw error
    captureException(error as Error)
  }
}
