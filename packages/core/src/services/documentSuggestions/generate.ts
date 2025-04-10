import { env } from '@latitude-data/env'
import { and, eq, inArray } from 'drizzle-orm'
import {
  CLOUD_MESSAGES,
  Commit,
  DocumentVersion,
  EvaluationResultTmp,
  EvaluationTmp,
  EvaluationV2,
  MAX_DOCUMENT_SUGGESTIONS_PER_EVALUATION,
  MAX_EVALUATION_RESULTS_PER_DOCUMENT_SUGGESTION,
  Workspace,
} from '../../browser'
import { database, Database } from '../../client'
import { publisher } from '../../events/publisher'
import {
  ConnectedEvaluationsRepository,
  DocumentSuggestionsRepository,
  DocumentVersionsRepository,
  EvaluationResultsRepository,
  EvaluationResultsV2Repository,
} from '../../repositories'
import { documentSuggestions, evaluationResultsV2 } from '../../schema'
import { getCopilot, runCopilot } from '../copilot'
import { serialize as serializeEvaluationResult } from '../evaluationResults'
import { getEvaluationPrompt as serializeEvaluation } from '../evaluations'
import {
  serializeEvaluationResult as serializeEvaluationResultV2,
  serializeEvaluation as serializeEvaluationV2,
} from './serialize'
import { Result } from './../../lib/Result'
import { UnprocessableEntityError } from './../../lib/errors'
import Transaction from './../../lib/Transaction'

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
    { path: env.COPILOT_REFINE_PROMPT_PATH },
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
            'Cannot use these results for a suggestion',
          ),
        )
      }
    } else {
      if (!result.evaluatedProviderLogId || result.result === undefined) {
        return Result.error(
          new UnprocessableEntityError(
            'Cannot use these results for a suggestion',
          ),
        )
      }
    }
  }

  const serializedEvaluation =
    evaluation.version === 'v2'
      ? await serializeEvaluationV2({ evaluation }).then((r) => r.unwrap())
      : await serializeEvaluation({ workspace, evaluation }, db).then((r) =>
          r.unwrap(),
        )

  const serializedResults = await Promise.all(
    results.map((result) =>
      result.version === 'v2'
        ? serializeEvaluationResultV2(
            { evaluation: evaluation as EvaluationV2, result, workspace },
            db,
          ).then((r) => r.unwrap())
        : serializeEvaluationResult(
            { workspace, evaluationResult: result },
            db,
          ).then((r) => r.unwrap()),
    ),
  )

  const result = (await runCopilot({
    copilot: copilot,
    parameters: {
      prompt: document.content,
      evaluation: serializedEvaluation,
      results: serializedResults,
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
