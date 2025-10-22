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

  const providerLogsRepository = new ProviderLogsRepository(workspace.id, db)
  const providerLog = await providerLogsRepository
    .find(result.evaluatedLogId)
    .then((r) => r.unwrap())

  const documentLogsRepository = new DocumentLogsRepository(workspace.id, db)
  const documentLog = await documentLogsRepository
    .findByUuid(providerLog.documentLogUuid!)
    .then((r) => r.unwrap())

  const evaluatedLog = await serializeDocumentLog(
    { documentLog, workspace },
    db,
  ).then((r) => r.unwrap())

  // Compatibility with refine v1 prompt
  return Result.ok({ result: result.score, reason, evaluatedLog })
}
