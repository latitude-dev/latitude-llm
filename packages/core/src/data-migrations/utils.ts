import { Result, TypedResult } from '../lib/Result'
import { unsafelyFindWorkspace } from '../data-access'
import {
  DocumentVersion,
  Commit,
  buildConversation,
  EvaluationMetadataType,
  EvaluationResultableType,
  EvaluationV2,
  formatMessage,
  Workspace,
  EvaluationType,
  LlmEvaluationMetric,
  HumanEvaluationMetric,
  ProviderLog,
  EvaluationResult,
  Evaluation,
  EvaluationConfigurationBoolean,
  EvaluationConfigurationNumerical,
  EvaluationResultV2,
} from '../browser'
import {
  commits,
  documentLogs,
  evaluationResults,
  evaluationResultsV2,
  evaluationVersions,
  providerLogs,
} from '../schema'
import { CommitsRepository, DocumentVersionsRepository } from '../repositories'
import { and, inArray, isNotNull, isNull, sum } from 'drizzle-orm'
import { database, Database } from '../client'
import { connectedEvaluations } from '../schema'
import { evaluations } from '../schema'
import { eq, getTableColumns } from 'drizzle-orm'
import providerLogPresenter from '../services/providerLogs/presenter'
import { compact } from 'lodash-es'
import { normalizeScore } from '../services/evaluationsV2/shared'
import Transaction from '../lib/Transaction'

export interface MigrationContext {
  workspaceId: number
  workspace: Workspace
  migrationName: string
}

export interface MigrationStats {
  processedCount: number
  successCount: number
  errorCount: number
}

export async function initializeMigration(
  workspaceIdStr: string,
  migrationName: string,
): Promise<TypedResult<MigrationContext, Error>> {
  console.log(
    `[${migrationName}] Starting migration for workspace ID: ${workspaceIdStr}`,
  )

  const workspaceId = parseInt(workspaceIdStr, 10)
  if (isNaN(workspaceId)) {
    console.error(
      `[${migrationName}] Invalid workspaceId provided: ${workspaceIdStr}. It must be a number.`,
    )
    return Result.error(new Error(`Invalid workspaceId: ${workspaceIdStr}`))
  }

  const workspace = await unsafelyFindWorkspace(workspaceId)
  if (!workspace) {
    console.error(
      `[${migrationName}] Workspace with ID ${workspaceId} not found. Skipping migration for this workspace.`,
    )
    return Result.error(new Error(`Workspace not found: ${workspaceId}`))
  }

  console.log(
    `[${migrationName}] Found workspace: ${workspace.name} (${workspace.id})`,
  )

  return Result.ok({
    workspaceId,
    workspace,
    migrationName,
  })
}

export function logMigrationProgress(
  migrationName: string,
  message: string,
  data?: Record<string, unknown>,
) {
  const logMessage = `[${migrationName}] ${message}`
  if (data) {
    console.log(logMessage, data)
  } else {
    console.log(logMessage)
  }
}

export function logMigrationError(
  migrationName: string,
  message: string,
  error?: unknown,
) {
  const logMessage = `[${migrationName}] ${message}`
  if (error) {
    console.error(logMessage, error)
  } else {
    console.error(logMessage)
  }
}

export function logMigrationSummary(
  migrationName: string,
  stats: MigrationStats,
  workspaceId: number,
) {
  console.log(
    `[${migrationName}] Migration completed for workspace ${workspaceId}`,
  )
  console.log(`[${migrationName}] Summary:`)
  console.log(`  - Total processed: ${stats.processedCount}`)
  console.log(`  - Successful: ${stats.successCount}`)
  console.log(`  - Failed: ${stats.errorCount}`)
}

export function createMigrationStats(): MigrationStats {
  return {
    processedCount: 0,
    successCount: 0,
    errorCount: 0,
  }
}

export async function findExistingEvaluationV2(
  {
    name,
    workspace,
    document,
    commit,
    metric,
    evaluationType,
  }: {
    name: string
    workspace: Workspace
    document: DocumentVersion
    commit: Commit
    metric: LlmEvaluationMetric | HumanEvaluationMetric
    evaluationType: EvaluationType
  },
  db: Database,
): Promise<EvaluationV2<typeof evaluationType, typeof metric> | undefined> {
  const result = await db
    .select(getTableColumns(evaluationVersions))
    .from(evaluationVersions)
    .where(
      and(
        eq(evaluationVersions.documentUuid, document.documentUuid),
        eq(evaluationVersions.commitId, commit.id),
        eq(evaluationVersions.workspaceId, workspace.id),
        eq(evaluationVersions.name, name),
        eq(evaluationVersions.type, evaluationType),
      ),
    )
    .then((r) => r[0])

  if (!result) return undefined

  return {
    ...result,
    uuid: result.evaluationUuid,
    versionId: result.id,
    type: evaluationType,
    metric,
  } as EvaluationV2<typeof evaluationType, typeof metric>
}

// @ts-expect-error - dont wanna spend time typing this
export function computeReason({ result, providerLog }) {
  if (result.reason) return result.reason
  if (!providerLog) return

  try {
    const response = JSON.parse(providerLog?.response)

    if (response) return response.reason
  } catch (e) {
    // do nothing
  }
}

export async function findOldReason({
  evaluationProviderLog,
  result,
}: {
  evaluationProviderLog?: ProviderLog
  result: any
}) {
  if (!evaluationProviderLog) return

  const providerLogDto = providerLogPresenter(evaluationProviderLog)
  return computeReason({ result, providerLog: providerLogDto })
}

export async function buildEvaluationResult({
  evaluatedProviderLog,
  migrationName,
}: {
  evaluatedProviderLog?: ProviderLog
  migrationName: string
}) {
  if (!evaluatedProviderLog) return {}

  const evaluatedProviderLogDto = providerLogPresenter(evaluatedProviderLog)
  const conversation = buildConversation(evaluatedProviderLogDto)
  if (conversation.at(-1)?.role != 'assistant') {
    logMigrationError(
      migrationName,
      `Cannot evaluate a log that does not end with an assistant message: ${JSON.stringify(evaluatedProviderLog, null, 2)}`,
    )
    return {}
  }

  return {
    actualOutput: formatMessage(conversation.at(-1)!),
    evaluatedProviderLogDto,
  }
}

export async function getDocumentAndCommit(
  {
    workspaceId,
    documentUuid,
  }: {
    workspaceId: number
    documentUuid: string
  },
  db = database,
) {
  const docsScope = new DocumentVersionsRepository(workspaceId, db)
  const commitsScope = new CommitsRepository(workspaceId, db)
  const document = await docsScope
    .getDocumentByUuid({
      documentUuid,
    })
    .then((r) => r.value)
  if (!document) {
    return {}
  }

  const commit = await commitsScope.find(document.commitId).then((r) => r.value)
  if (!commit) {
    return {}
  }

  return { document, commit }
}

export async function getEvaluations(
  {
    workspaceId,
    evaluationMetadata,
    evaluationConfiguration,
    evaluationResultableType,
    evaluationMetadataType,
    evaluationId,
  }: {
    workspaceId: number
    evaluationMetadata: any
    evaluationConfiguration: any
    evaluationResultableType: EvaluationResultableType
    evaluationMetadataType: EvaluationMetadataType
    evaluationId?: number
  },
  db = database,
) {
  return db
    .select({
      ...getTableColumns(evaluations),
      connectedEvaluationId: connectedEvaluations.id,
      documentUuid: connectedEvaluations.documentUuid,
      metadata: getTableColumns(evaluationMetadata),
      configuration: getTableColumns(evaluationConfiguration),
    })
    .from(evaluations)
    .innerJoin(
      connectedEvaluations,
      eq(evaluations.id, connectedEvaluations.evaluationId),
    )
    .innerJoin(
      evaluationConfiguration,
      eq(evaluations.resultConfigurationId, evaluationConfiguration.id),
    )
    .innerJoin(
      evaluationMetadata,
      eq(evaluations.metadataId, evaluationMetadata.id),
    )
    .where(
      and(
        eq(evaluations.metadataType, evaluationMetadataType),
        eq(evaluations.resultType, evaluationResultableType),
        eq(evaluations.workspaceId, workspaceId),
        evaluationId ? eq(evaluations.id, evaluationId) : undefined,
      ),
    )
    .execute()
}

export async function getEvaluationResults(
  {
    evaluationId,
    evaluationResultable,
    evaluationResultableType,
  }: {
    evaluationId: number
    evaluationResultable: any
    evaluationResultableType: EvaluationResultableType
  },
  db: Database,
) {
  return await db
    .selectDistinctOn(
      [
        evaluationResults.evaluationId,
        evaluationResults.evaluatedProviderLogId,
      ],
      {
        ...getTableColumns(evaluationResults),
        resultable: getTableColumns(evaluationResultable),
      },
    )
    .from(evaluationResults)
    .innerJoin(
      evaluationResultable,
      eq(evaluationResults.resultableId, evaluationResultable.id),
    )
    .innerJoin(
      providerLogs,
      eq(evaluationResults.evaluatedProviderLogId, providerLogs.id),
    )
    .innerJoin(
      documentLogs,
      eq(providerLogs.documentLogUuid, documentLogs.uuid),
    )
    .innerJoin(commits, eq(documentLogs.commitId, commits.id))
    .where(
      and(
        eq(evaluationResults.evaluationId, evaluationId),
        eq(evaluationResults.resultableType, evaluationResultableType),
        isNotNull(evaluationResults.evaluatedProviderLogId),
        isNull(commits.deletedAt),
      ),
    )
    .execute()
}

export async function getEvaluationResultsData(
  {
    results,
  }: {
    results: EvaluationResult[]
  },
  db: Database,
) {
  const evaluatedProviderLogs = await db
    .select({
      ...getTableColumns(providerLogs),
      commitId: documentLogs.commitId,
    })
    .from(providerLogs)
    .innerJoin(
      documentLogs,
      eq(providerLogs.documentLogUuid, documentLogs.uuid),
    )
    .innerJoin(commits, eq(documentLogs.commitId, commits.id))
    .where(
      and(
        inArray(
          providerLogs.id,
          compact(results.map((o) => o.evaluatedProviderLogId)),
        ),
        isNull(commits.deletedAt),
      ),
    )

  const evaluationProviderLogs = await db
    .select()
    .from(providerLogs)
    .where(
      inArray(
        providerLogs.id,
        compact(results.map((o) => o.evaluationProviderLogId)),
      ),
    )

  const stats = await statsByDocumentLogUuids(
    results.map((o) => o.uuid),
    db,
  )

  return {
    evaluatedProviderLogs,
    evaluationProviderLogs,
    stats,
  }
}

async function statsByDocumentLogUuids(uuids: string[], db: Database) {
  return await db
    .select({
      documentLogUuid: providerLogs.documentLogUuid,
      tokens: sum(providerLogs.tokens).mapWith(Number),
      duration: sum(providerLogs.duration).mapWith(Number),
      costInMillicents: sum(providerLogs.costInMillicents).mapWith(Number),
    })
    .from(providerLogs)
    .where(inArray(providerLogs.documentLogUuid, uuids))
    .groupBy(providerLogs.documentLogUuid)
}

export async function migrateEvaluationResultz(
  {
    workspace,
    oldEval,
    newEval,
    evaluationResultable,
    evaluationResultableType,
    migrationName,
  }: {
    workspace: Workspace
    oldEval: Evaluation & {
      configuration:
        | EvaluationConfigurationBoolean
        | EvaluationConfigurationNumerical
    }
    newEval: EvaluationV2
    evaluationResultable: any
    evaluationResultableType: EvaluationResultableType
    migrationName: string
  },
  db: Database,
) {
  const oldEvalResults = await getEvaluationResults(
    {
      evaluationId: oldEval.id,
      evaluationResultable,
      evaluationResultableType,
    },
    db,
  )
  logMigrationProgress(
    migrationName,
    `Migrating ${oldEvalResults.length} results for evaluation ${oldEval.id}`,
  )

  const { evaluatedProviderLogs, evaluationProviderLogs, stats } =
    await getEvaluationResultsData(
      {
        results: oldEvalResults,
      },
      db,
    )

  let toInsert: Omit<EvaluationResultV2, 'id' | 'uuid'>[] = []

  for (const result of oldEvalResults) {
    const evaluatedProviderLog = evaluatedProviderLogs.find(
      (pl) => pl.id === result.evaluatedProviderLogId,
    )
    if (!evaluatedProviderLog) {
      logMigrationError(migrationName, 'Could not find evaluated provider log')
      continue
    }

    const evaluationProviderLog = evaluationProviderLogs.find(
      (pl) => pl.id === result.evaluationProviderLogId,
    )
    if (!evaluationProviderLog && newEval.type === EvaluationType.Llm) {
      logMigrationError(migrationName, 'Could not find evaluation provider log')
      continue
    }

    const reason = await findOldReason({
      result,
      evaluationProviderLog,
    })

    const statz = stats.find((o) => o.documentLogUuid === result.uuid) || {
      tokens: 0,
      costInMillicents: 0,
      duration: 0,
    }

    const { score, normalizedScore, hasPassed } =
      evaluationResultableType === EvaluationResultableType.Number
        ? calculateNormalizedRatingScore({
            result,
            oldEval: oldEval as Evaluation & {
              configuration: EvaluationConfigurationNumerical
            },
          })
        : calculateNormalizedBinaryScore({
            result,
          })

    const { actualOutput, evaluatedProviderLogDto } =
      await buildEvaluationResult({
        evaluatedProviderLog,
        migrationName,
      })
    if (!evaluatedProviderLogDto) {
      logMigrationError(migrationName, 'Could not find evaluated provider log')
      continue
    }
    if (!actualOutput) {
      logMigrationError(migrationName, 'Could not find actual output')
      continue
    }

    const metadata =
      newEval.type === EvaluationType.Llm
        ? {
            actualOutput,
            reason,
            configuration: newEval.configuration,
            tokens: statz.tokens,
            cost: statz.costInMillicents,
            duration: statz.duration,
            evaluationLogId: evaluationProviderLog!.id,
          }
        : {
            actualOutput,
            reason,
            configuration: newEval.configuration,
          }

    const value = {
      score:
        newEval.metric === LlmEvaluationMetric.Custom ? normalizedScore : score,
      normalizedScore,
      hasPassed,
      metadata,
    }

    // @ts-expect-error - dont wanna spend time typing this
    toInsert.push({
      workspaceId: workspace.id,
      commitId: evaluatedProviderLog.commitId,
      evaluationUuid: newEval.uuid,
      evaluatedLogId: evaluatedProviderLogDto.id,
      ...value,
      createdAt: result.createdAt,
      updatedAt: result.updatedAt,
    })
  }

  logMigrationProgress(migrationName, `Inserting ${toInsert.length} results...`)

  await db.insert(evaluationResultsV2).values(toInsert).execute()

  logMigrationProgress(migrationName, `Inserted ${toInsert.length} results!`)
}

export function calculateNormalizedRatingScore({
  result,
  oldEval,
}: {
  result: EvaluationResult & { resultable: { result: number } }
  oldEval: Evaluation & {
    configuration: EvaluationConfigurationNumerical
  }
}) {
  const rating = result.resultable.result
  const minRating = oldEval.configuration.minValue
  const maxRating = oldEval.configuration.maxValue

  const score = Math.min(
    Math.max(Number(rating.toFixed(0)), minRating),
    maxRating,
  )

  let normalizedScore = normalizeScore(score, minRating, maxRating)

  const minThreshold = minRating
  const maxThreshold = maxRating
  const hasPassed = score >= minThreshold && score <= maxThreshold

  return { score, normalizedScore, hasPassed }
}

export function calculateNormalizedBinaryScore({
  result,
}: {
  result: EvaluationResult & { resultable: { result: boolean } }
}) {
  const passed = result.resultable.result
  const score = passed ? 1 : 0

  let normalizedScore = normalizeScore(score, 0, 1)
  let hasPassed = score === 1

  return { score, normalizedScore, hasPassed }
}
