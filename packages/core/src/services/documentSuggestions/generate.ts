import { env } from '@latitude-data/env'
import { and, eq, inArray } from 'drizzle-orm'
import {
  CLOUD_MESSAGES,
  Commit,
  DocumentVersion,
  EvaluationMetric,
  EvaluationResultTmp,
  EvaluationResultV2,
  EvaluationTmp,
  EvaluationType,
  EvaluationV2,
  MAX_DOCUMENT_SUGGESTIONS_PER_EVALUATION,
  MAX_EVALUATION_RESULTS_PER_DOCUMENT_SUGGESTION,
  Workspace,
} from '../../browser'
import { database, Database } from '../../client'
import { publisher } from '../../events/publisher'
import { Result, Transaction, UnprocessableEntityError } from '../../lib'
import {
  ConnectedEvaluationsRepository,
  DocumentLogsRepository,
  DocumentSuggestionsRepository,
  DocumentVersionsRepository,
  EvaluationResultsRepository,
  EvaluationResultsV2Repository,
  ProviderLogsRepository,
} from '../../repositories'
import { documentSuggestions, evaluationResultsV2 } from '../../schema'
import { getCopilot, runCopilot } from '../copilot'
import { serialize as serializeDocumentLog } from '../documentLogs'
import { serialize as getEvaluationResultInfo } from '../evaluationResults'
import { getEvaluationPrompt as getEvaluationInfo } from '../evaluations'
import { EVALUATION_SPECIFICATIONS } from '../evaluationsV2'

async function checkSuggestionLimits(
  {
    document,
    evaluation,
    workspace,
  }: {
    document: DocumentVersion
    evaluation: EvaluationTmp
    commit: Commit
    workspace: Workspace
  },
  db: Database = database,
) {
  const repository = new DocumentSuggestionsRepository(workspace.id, db)
  const count = await repository
    .countByDocumentVersionAndEvaluation({
      commitId: document.commitId,
      documentUuid: document.documentUuid,
      evaluationUuid: evaluation.version === 'v2' ? evaluation.uuid : undefined,
      evaluationId: evaluation.version !== 'v2' ? evaluation.id : undefined,
    })
    .then((r) => r.unwrap())
  if (count >= MAX_DOCUMENT_SUGGESTIONS_PER_EVALUATION) {
    return Result.error(
      new UnprocessableEntityError(
        'Maximum suggestions reached for this evaluation',
      ),
    )
  }

  return Result.nil()
}

export async function generateDocumentSuggestion(
  {
    document,
    evaluation,
    results,
    commit,
    workspace,
  }: {
    document: DocumentVersion
    evaluation: EvaluationTmp
    results?: EvaluationResultTmp[]
    commit: Commit
    workspace: Workspace
  },
  db: Database = database,
) {
  if (!env.LATITUDE_CLOUD) {
    return Result.error(new Error(CLOUD_MESSAGES.documentSuggestions))
  }

  if (!env.COPILOT_REFINE_PROMPT_PATH) {
    return Result.error(new Error('COPILOT_REFINE_PROMPT_PATH is not set'))
  }

  const copilot = await getCopilot(
    {
      path: env.COPILOT_REFINE_PROMPT_PATH,
    },
    db,
  ).then((r) => r.unwrap())

  if (evaluation.version === 'v2') {
    if (!evaluation.enableSuggestions) {
      return Result.error(
        new UnprocessableEntityError(
          'Suggestions are not enabled for this evaluation',
        ),
      )
    }
  } else {
    const connectedsRepository = new ConnectedEvaluationsRepository(
      workspace.id,
      db,
    )
    const connected = await connectedsRepository
      .findByDocumentAndEvaluation(document.documentUuid, evaluation.id)
      .then((r) => r.unwrap())
    if (!connected || !connected.live) {
      return Result.error(
        new UnprocessableEntityError(
          'Suggestions not available for this evaluation',
        ),
      )
    }
  }

  const limits = await checkSuggestionLimits(
    { document, evaluation, commit, workspace },
    db,
  )
  if (limits.error) return limits

  if (!results) {
    if (evaluation.version === 'v2') {
      const resultsRepository = new EvaluationResultsV2Repository(
        workspace.id,
        db,
      )
      results = await resultsRepository
        .selectForDocumentSuggestion({
          commitId: commit.id,
          evaluationUuid: evaluation.uuid,
        })
        .then((r) => r.unwrap())
        .then((r) => r.map((r) => ({ ...r, version: 'v2' as const })))
    } else {
      const resultsRepository = new EvaluationResultsRepository(
        workspace.id,
        db,
      )
      results = await resultsRepository
        .selectForDocumentSuggestion(evaluation.id)
        .then((r) => r.unwrap())
        .then((r) => r.map((r) => ({ ...r, version: 'v1' as const })))
    }
  }

  if (!results!.length) {
    return Result.error(
      new UnprocessableEntityError('Not enough evaluation results found'),
    )
  }

  results = results!.slice(0, MAX_EVALUATION_RESULTS_PER_DOCUMENT_SUGGESTION)

  for (const result of results) {
    if (result.version === 'v2') {
      if (result.hasPassed || result.error || result.usedForSuggestion) {
        return Result.error(
          new UnprocessableEntityError(
            'Cannot use this result for a suggestion',
          ),
        )
      }
    } else {
      if (!result.evaluatedProviderLogId || result.result === undefined) {
        return Result.error(
          new UnprocessableEntityError(
            'Cannot use this result for a suggestion',
          ),
        )
      }
    }
  }

  const evaluationInfo =
    evaluation.version === 'v2'
      ? await getEvaluationV2Info({ evaluation }).then((r) => r.unwrap())
      : await getEvaluationInfo({ workspace, evaluation }, db).then((r) =>
          r.unwrap(),
        )

  const resultsInfo = await Promise.all(
    results.map((result) =>
      result.version === 'v2'
        ? getEvaluationResultV2Info(
            { evaluation: evaluation as EvaluationV2, result, workspace },
            db,
          ).then((r) => r.unwrap())
        : getEvaluationResultInfo(
            { workspace, evaluationResult: result },
            db,
          ).then((r) => r.unwrap()),
    ),
  )

  const result = (await runCopilot({
    copilot: copilot,
    parameters: {
      prompt: document.content,
      evaluation: evaluationInfo,
      results: resultsInfo,
    },
  }).then((r) => r.unwrap())) as {
    prompt: string
    summary: string
  }

  return Transaction.call(async (tx) => {
    const documentsRepository = new DocumentVersionsRepository(workspace.id, tx)
    const lock = await documentsRepository.lock({
      commitId: document.commitId,
      documentUuid: document.documentUuid,
    })
    if (lock.error) return lock

    const limits = await checkSuggestionLimits(
      { document, evaluation, commit, workspace },
      tx,
    )
    if (limits.error) return limits

    const suggestion = await tx
      .insert(documentSuggestions)
      .values({
        workspaceId: workspace.id,
        commitId: document.commitId,
        documentUuid: document.documentUuid,
        evaluationUuid:
          evaluation.version === 'v2' ? evaluation.uuid : undefined,
        evaluationId: evaluation.version !== 'v2' ? evaluation.id : undefined,
        oldPrompt: document.content,
        newPrompt: result.prompt,
        summary: result.summary,
      })
      .returning()
      .then((r) => r[0]!)

    if (evaluation.version === 'v2') {
      await tx
        .update(evaluationResultsV2)
        .set({
          usedForSuggestion: true,
        })
        .where(
          and(
            eq(evaluationResultsV2.workspaceId, workspace.id),
            inArray(
              evaluationResultsV2.id,
              results.map((r) => r.id),
            ),
          ),
        )
    }

    publisher.publishLater({
      type: 'documentSuggestionCreated',
      data: {
        workspaceId: workspace.id,
        suggestion: suggestion,
        evaluation: evaluation,
      },
    })

    return Result.ok({ suggestion })
  }, db)
}

async function getEvaluationV2Info<
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

async function getEvaluationResultV2Info<
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
  db: Database = database,
) {
  const typeSpecification = EVALUATION_SPECIFICATIONS[evaluation.type]
  if (!typeSpecification) {
    return Result.error(new Error('Invalid evaluation type'))
  }

  const metricSpecification = typeSpecification.metrics[evaluation.metric]
  if (!metricSpecification) {
    return Result.error(new Error('Invalid evaluation metric'))
  }

  let reason = `${typeSpecification.name} evaluations do not report a reason`
  if (
    evaluation.type === EvaluationType.Llm ||
    evaluation.type === EvaluationType.Human
  ) {
    // Seems TypeScript is not able to infer the type of the result
    reason =
      (result as EvaluationResultV2<EvaluationType.Llm | EvaluationType.Human>)
        .metadata!.reason || 'No reason reported'
  }

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

  return Result.ok({
    result: result.score, // Compatibility with refine v1 prompt
    reason: reason,
    evaluatedLog: evaluatedLog,
  })
}
