import { env } from '@latitude-data/env'
import { and, eq, inArray } from 'drizzle-orm'
import { z } from 'zod'
import {
  CLOUD_MESSAGES,
  Commit,
  DocumentVersion,
  EvaluationResultV2,
  EvaluationV2,
  MAX_DOCUMENT_SUGGESTIONS_PER_EVALUATION,
  Workspace,
} from '../../browser'
import { database, Database } from '../../client'
import { publisher } from '../../events/publisher'
import { UnprocessableEntityError } from '../../lib/errors'
import { Result } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import {
  DocumentSuggestionsRepository,
  DocumentVersionsRepository,
  EvaluationResultsV2Repository,
} from '../../repositories'
import { documentSuggestions, evaluationResultsV2 } from '../../schema'
import { getCopilot, runCopilot } from '../copilot'
import {
  serializeEvaluationResult as serializeEvaluationResultV2,
  serializeEvaluation as serializeEvaluationV2,
} from './serialize'

async function checkSuggestionLimits(
  {
    document,
    evaluation,
    workspace,
  }: {
    document: DocumentVersion
    evaluation: EvaluationV2
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
      evaluationUuid: evaluation.uuid,
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

const refinerSchema = z.object({
  prompt: z.string(),
  summary: z.string(),
})

// TODO: Add tests for evals v2
export async function generateDocumentSuggestion(
  {
    document,
    evaluation,
    results,
    commit,
    workspace,
  }: {
    document: DocumentVersion
    evaluation: EvaluationV2
    results?: EvaluationResultV2[]
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

  if (!evaluation.enableSuggestions) {
    return Result.error(
      new UnprocessableEntityError(
        'Suggestions are not enabled for this evaluation',
      ),
    )
  }

  const limits = await checkSuggestionLimits(
    { document, evaluation, commit, workspace },
    db,
  )
  if (limits.error) return limits

  if (!results) {
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
  }

  if (!results || !results!.length) {
    return Result.error(
      new UnprocessableEntityError('Not enough evaluation results found'),
    )
  }

  for (const result of results) {
    if (result.hasPassed || result.error || result.usedForSuggestion) {
      return Result.error(
        new UnprocessableEntityError(
          'Cannot use these results for a suggestion',
        ),
      )
    }
  }

  const serializedEvaluation = await serializeEvaluationV2({ evaluation }).then(
    (r) => r.unwrap(),
  )

  const serializedResults = await Promise.all(
    results.map((result) =>
      serializeEvaluationResultV2(
        { evaluation: evaluation as EvaluationV2, result, workspace },
        db,
      ).then((r) => r.unwrap()),
    ),
  )

  const result = await runCopilot({
    copilot: copilot,
    parameters: {
      prompt: document.content,
      evaluation: serializedEvaluation,
      results: serializedResults,
    },
    schema: refinerSchema,
  }).then((r) => r.unwrap())

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
        evaluationUuid: evaluation.uuid,
        oldPrompt: document.content,
        newPrompt: result.prompt,
        summary: result.summary,
      })
      .returning()
      .then((r) => r[0]!)

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
