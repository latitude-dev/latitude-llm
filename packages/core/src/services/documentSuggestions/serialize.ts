import { database } from '../../client'
import {
  EvaluationMetric,
  EvaluationResultSuccessValue,
  EvaluationResultV2,
  EvaluationType,
  EvaluationV2,
} from '../../constants'
import { Result } from '../../lib/Result'
import {
  DocumentLogsRepository,
  ProviderLogsRepository,
  SpansRepository,
} from '../../repositories'
import { type Workspace } from '../../schema/models/types/Workspace'
import { serialize as serializeDocumentLog } from '../documentLogs/serialize'
import { EVALUATION_SPECIFICATIONS } from '../evaluationsV2/specifications'

export async function serializeEvaluation<
  T extends EvaluationType,
  M extends EvaluationMetric<T>,
>({ evaluation }: { evaluation: EvaluationV2<T, M> }) {
  const typeSpecification = EVALUATION_SPECIFICATIONS[evaluation.type]
  if (!typeSpecification) {
    return Result.error(new Error('Invalid evaluation type'))
  }

  const metricSpecification = typeSpecification.metrics[evaluation.metric]
  if (!metricSpecification) {
    return Result.error(new Error('Invalid evaluation metric'))
  }

  return Result.ok(
    `
# Name: ${evaluation.name}
${evaluation.description}

## Type: ${typeSpecification.name}
${typeSpecification.description}

## Metric: ${metricSpecification.name}
${metricSpecification.description}

## Configuration:
\`\`\`json
${JSON.stringify(evaluation.configuration, null, 2)}
\`\`\`

${evaluation.configuration.reverseScale ? "> Note: This evaluation's scale is reversed. That means a lower score is better." : '> Note: A higher score is better.'}
`.trim(),
  )
}

export async function serializeEvaluationResult<
  T extends EvaluationType,
  M extends EvaluationMetric<T>,
>(
  {
    evaluation,
    result,
    workspace,
  }: {
    evaluation: EvaluationV2<T, M>
    result: EvaluationResultV2<T, M>
    workspace: Workspace
  },
  db = database,
) {
  const typeSpecification = EVALUATION_SPECIFICATIONS[evaluation.type]
  if (!typeSpecification) {
    return Result.error(new Error('Invalid evaluation type'))
  }

  const metricSpecification = typeSpecification.metrics[evaluation.metric]
  if (!metricSpecification) {
    return Result.error(new Error('Invalid evaluation metric'))
  }

  if (result.error) {
    return Result.error(new Error('Invalid evaluation result'))
  }

  const reason =
    metricSpecification.resultReason(
      result as EvaluationResultSuccessValue<T, M>,
    ) || 'No reason reported'

  let documentLogUuid: string
  if (result.evaluatedSpanId && result.evaluatedTraceId) {
    const spansRepository = new SpansRepository(workspace.id, db)
    const span = await spansRepository
      .get({
        spanId: result.evaluatedSpanId,
        traceId: result.evaluatedTraceId,
      })
      .then((r) => r.unwrap())

    if (!span) {
      return Result.error(
        new Error(`Span not found for spanId and traceId combination`),
      )
    }

    if (!span.documentLogUuid) {
      return Result.error(new Error(`Span missing documentLogUuid`))
    }

    documentLogUuid = span.documentLogUuid
  } else if (result.evaluatedLogId) {
    // Fallback to legacy providerLog approach for backward compatibility
    const providerLogsRepository = new ProviderLogsRepository(workspace.id, db)
    const providerLog = await providerLogsRepository
      .find(result.evaluatedLogId)
      .then((r) => r.unwrap())

    documentLogUuid = providerLog.documentLogUuid!
  } else {
    return Result.error(
      new Error(
        'Evaluation result missing both span references and evaluatedLogId',
      ),
    )
  }

  const documentLogsRepository = new DocumentLogsRepository(workspace.id, db)
  const documentLog = await documentLogsRepository
    .findByUuid(documentLogUuid)
    .then((r) => r.unwrap())

  const evaluatedLog = await serializeDocumentLog(
    { documentLog, workspace },
    db,
  ).then((r) => r.unwrap())

  // Compatibility with refine v1 prompt
  return Result.ok({ result: result.score, reason, evaluatedLog })
}
