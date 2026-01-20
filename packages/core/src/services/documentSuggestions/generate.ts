import { env } from '@latitude-data/env'
import { and, eq, inArray } from 'drizzle-orm'
import { z } from 'zod'
import { database } from '../../client'
import {
  CLOUD_MESSAGES,
  EvaluationResultV2,
  EvaluationV2,
  MAX_DOCUMENT_SUGGESTIONS_PER_EVALUATION,
} from '../../constants'
import { publisher } from '../../events/publisher'
import { UnprocessableEntityError } from '../../lib/errors'
import { Result } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import {
  DocumentSuggestionsRepository,
  DocumentVersionsRepository,
  EvaluationResultsV2Repository,
} from '../../repositories'
import { documentSuggestions } from '../../schema/models/documentSuggestions'
import { evaluationResultsV2 } from '../../schema/models/evaluationResultsV2'
import { type Commit } from '../../schema/models/types/Commit'
import { type DocumentVersion } from '../../schema/models/types/DocumentVersion'
import { type Workspace } from '../../schema/models/types/Workspace'
import { runCopilot } from '../copilot'
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
  db = database,
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
  transaction = new Transaction(),
) {
  if (!env.LATITUDE_CLOUD) {
    return Result.error(new Error(CLOUD_MESSAGES.documentSuggestions))
  }

  if (!env.COPILOT_PROMPT_REFINE_PATH) {
    return Result.error(new Error('COPILOT_PROMPT_REFINE_PATH is not set'))
  }

  if (!evaluation.enableSuggestions) {
    return Result.error(
      new UnprocessableEntityError(
        'Suggestions are not enabled for this evaluation',
      ),
    )
  }

  const limitsResult = await checkSuggestionLimits({
    document,
    evaluation,
    commit,
    workspace,
  })
  if (limitsResult.error) return limitsResult
  if (!results) {
    const resultsRepository = new EvaluationResultsV2Repository(workspace.id)
    results = await resultsRepository
      .selectForDocumentSuggestion({
        commitId: commit.id,
        evaluationUuid: evaluation.uuid,
      })
      .then((r) => r.unwrap())
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

  const serializedEvaluation = await serializeEvaluationV2({
    evaluation,
  }).then((r) => r.unwrap())

  const serializedResults = await Promise.all(
    results.map((result) =>
      serializeEvaluationResultV2({ evaluation, result, workspace }).then((r) =>
        r.unwrap(),
      ),
    ),
  )

  const result = await runCopilot({
    path: env.COPILOT_PROMPT_REFINE_PATH,
    parameters: {
      prompt: document.content,
      evaluation: serializedEvaluation,
      results: serializedResults,
    },
    schema: refinerSchema,
  }).then((r) => r.unwrap())

  return transaction.call(async (tx) => {
    const documentsRepository = new DocumentVersionsRepository(workspace.id, tx)
    const lock = await documentsRepository.lock({
      commitId: document.commitId,
      documentUuid: document.documentUuid,
    })
    if (lock.error) return lock

    const limits = await checkSuggestionLimits({
      document,
      evaluation,
      commit,
      workspace,
    })
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
  })
}
