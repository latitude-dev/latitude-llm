import { AppRouteHandler } from '$/openApi/types'
import {
  CommitsRepository,
  DocumentVersionsRepository,
  EvaluationsV2Repository,
  SpanMetadatasRepository,
  SpansRepository,
} from '@latitude-data/core/repositories'
import { AnnotateRoute } from './annotate.route'
import { annotateEvaluationV2 } from '@latitude-data/core/services/evaluationsV2/annotate'
import { findProjectFromDocument } from '@latitude-data/core/data-access/projects'
import { NotFoundError } from '@latitude-data/constants/errors'
import { serializeEvaluationResultV2 } from './serializeEvaluationResultV2'
import {
  HEAD_COMMIT,
  MainSpanMetadata,
  MainSpanType,
  SpanWithDetails,
} from '@latitude-data/core/constants'

// @ts-expect-error: broken types
export const annotateHandler: AppRouteHandler<AnnotateRoute> = async (c) => {
  const {
    score,
    metadata: resultMetadata,
    versionUuid = HEAD_COMMIT,
    context,
  } = c.req.valid('json')
  const { conversationUuid, evaluationUuid } = c.req.valid('param')
  const workspace = c.get('workspace')
  const evaluationsRepo = new EvaluationsV2Repository(workspace.id)
  const spansRepo = new SpansRepository(workspace.id)
  const spanMetadataRepo = new SpanMetadatasRepository(workspace.id)
  const span =
    await spansRepo.findLastMainSpanByDocumentLogUuid(conversationUuid)
  if (!span) {
    throw new NotFoundError('Could not find span with uuid ${conversationUuid}')
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

  const project = await findProjectFromDocument(document)
  if (!project) {
    throw new NotFoundError('Could not find project for this document')
  }

  const commitsRepo = new CommitsRepository(workspace.id)
  const commit = await commitsRepo
    .getCommitByUuid({
      uuid: versionUuid,
      projectId: project.id,
    })
    .then((r) => r.unwrap())
  if (!commit) {
    throw new NotFoundError(
      `Could not find version ${versionUuid} in project ${project.name}`,
    )
  }

  const evaluation = await evaluationsRepo
    .getAtCommitByDocument({
      documentUuid: document.documentUuid,
      commitUuid: versionUuid,
      evaluationUuid,
      projectId: project.id,
    })
    .then((r) => r.unwrap())
  if (!evaluation) {
    throw new NotFoundError('Could not find evaluation for this version')
  }

  const annotation = await annotateEvaluationV2({
    span: { ...span, metadata } as SpanWithDetails<MainSpanType>,
    evaluation,
    resultScore: score,
    resultMetadata: {
      ...resultMetadata,
      selectedContexts: context ? [context] : undefined,
    },
    commit,
    workspace: workspace,
  }).then((r) => r.unwrap())

  const data = serializeEvaluationResultV2(annotation, {
    commit: commit,
  })

  return c.json(data, 201)
}
