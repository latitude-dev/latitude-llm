import { env } from '@latitude-data/env'
import {
  CLOUD_MESSAGES,
  DocumentVersion,
  EvaluationDto,
  EvaluationResultDto,
  MAX_DOCUMENT_SUGGESTIONS_PER_EVALUATION,
  MAX_EVALUATION_RESULTS_PER_DOCUMENT_SUGGESTION,
  Workspace,
} from '../../browser'
import { database, Database } from '../../client'
import { publisher } from '../../events/publisher'
import { Result, Transaction, UnprocessableEntityError } from '../../lib'
import {
  ConnectedEvaluationsRepository,
  DocumentSuggestionsRepository,
  DocumentVersionsRepository,
  EvaluationResultsRepository,
} from '../../repositories'
import { documentSuggestions } from '../../schema'
import { getCopilot, runCopilot } from '../copilot'
import { serialize as serializeEvaluationResult } from '../evaluationResults'
import { getEvaluationPrompt } from '../evaluations'

async function checkSuggestionLimits(
  {
    document,
    evaluation,
    workspace,
  }: {
    document: DocumentVersion
    evaluation: EvaluationDto
    workspace: Workspace
  },
  db: Database = database,
) {
  const repository = new DocumentSuggestionsRepository(workspace.id, db)

  const count = await repository
    .countByDocumentVersionAndEvaluation({
      commitId: document.commitId,
      documentUuid: document.documentUuid,
      evaluationId: evaluation.id,
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
    workspace,
  }: {
    document: DocumentVersion
    evaluation: EvaluationDto
    results?: EvaluationResultDto[]
    workspace: Workspace
  },
  db: Database = database,
) {
  const resultsRepository = new EvaluationResultsRepository(workspace.id, db)
  const connectedsRepository = new ConnectedEvaluationsRepository(
    workspace.id,
    db,
  )

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

  const limits = await checkSuggestionLimits(
    { workspace, document, evaluation },
    db,
  )
  if (limits.error) return limits

  if (!results) {
    results = await resultsRepository
      .selectForDocumentSuggestion(evaluation.id)
      .then((r) => r.unwrap())
  }

  if (!results!.length) {
    return Result.error(
      new UnprocessableEntityError('Not enough evaluation results found'),
    )
  }

  results = results!.slice(0, MAX_EVALUATION_RESULTS_PER_DOCUMENT_SUGGESTION)

  const serializedEvaluation = await getEvaluationPrompt(
    { workspace, evaluation },
    db,
  ).then((r) => r.unwrap())
  const serializedResults = await Promise.all(
    results.map((result) =>
      serializeEvaluationResult(
        {
          workspace: workspace,
          evaluationResult: result,
        },
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
      { workspace, document, evaluation },
      tx,
    )
    if (limits.error) return limits

    const suggestion = await tx
      .insert(documentSuggestions)
      .values({
        workspaceId: workspace.id,
        commitId: document.commitId,
        documentUuid: document.documentUuid,
        evaluationId: evaluation.id,
        oldPrompt: document.content,
        newPrompt: result.prompt,
        prompt: result.prompt, // TODO: Delete when migration is done
        summary: result.summary,
      })
      .returning()
      .then((r) => r[0]!)

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
