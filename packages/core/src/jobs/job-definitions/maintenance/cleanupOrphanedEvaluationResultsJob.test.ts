import { Job } from 'bullmq'
import { eq, inArray } from 'drizzle-orm'
import { describe, expect, it, beforeEach } from 'vitest'
import { database } from '../../../client'
import { EvaluationType, SpanType } from '../../../constants'
import { RuleEvaluationMetric, Providers } from '@latitude-data/constants'
import { evaluationResultsV2 } from '../../../schema/models/evaluationResultsV2'
import * as factories from '../../../tests/factories'
import { cleanupOrphanedEvaluationResultsJob } from './cleanupOrphanedEvaluationResultsJob'
import { type Workspace } from '../../../schema/models/types/Workspace'
import { type Commit } from '../../../schema/models/types/Commit'
import { type DocumentVersion } from '../../../schema/models/types/DocumentVersion'
import { type EvaluationV2 } from '../../../constants'

describe('cleanupOrphanedEvaluationResultsJob', () => {
  let workspace: Workspace
  let commit: Commit
  let document: DocumentVersion
  let evaluation: EvaluationV2

  beforeEach(async () => {
    const projectData = await factories.createProject({
      providers: [{ type: Providers.OpenAI, name: 'OpenAI' }],
      documents: {
        test: factories.helpers.createPrompt({ provider: 'OpenAI' }),
      },
    })
    workspace = projectData.workspace
    commit = projectData.commit
    document = projectData.documents[0]!

    evaluation = await factories.createEvaluationV2({
      document,
      commit,
      workspace,
      type: EvaluationType.Rule,
      metric: RuleEvaluationMetric.ExactMatch,
      configuration: {
        reverseScale: false,
        caseInsensitive: false,
        actualOutput: { messageSelection: 'last', parsingFormat: 'string' },
        expectedOutput: { parsingFormat: 'string' },
      },
    })
  })

  it('should only delete evaluation results without type or metric, keeping ones with both', async () => {
    const span1 = await factories.createSpan({
      workspaceId: workspace.id,
      documentUuid: document.documentUuid,
      commitUuid: commit.uuid,
      type: SpanType.Prompt,
    })

    const span2 = await factories.createSpan({
      workspaceId: workspace.id,
      documentUuid: document.documentUuid,
      commitUuid: commit.uuid,
      type: SpanType.Prompt,
    })

    const span3 = await factories.createSpan({
      workspaceId: workspace.id,
      documentUuid: document.documentUuid,
      commitUuid: commit.uuid,
      type: SpanType.Prompt,
    })

    const span4 = await factories.createSpan({
      workspaceId: workspace.id,
      documentUuid: document.documentUuid,
      commitUuid: commit.uuid,
      type: SpanType.Prompt,
    })

    const span5 = await factories.createSpan({
      workspaceId: workspace.id,
      documentUuid: document.documentUuid,
      commitUuid: commit.uuid,
      type: SpanType.Prompt,
    })

    const orphanedResult1 = await factories.createEvaluationResultV2({
      evaluation,
      span: span1,
      commit,
      workspace,
    })

    const orphanedResult2 = await factories.createEvaluationResultV2({
      evaluation,
      span: span2,
      commit,
      workspace,
    })

    const orphanedResult3 = await factories.createEvaluationResultV2({
      evaluation,
      span: span3,
      commit,
      workspace,
    })

    const validResult1 = await factories.createEvaluationResultV2({
      evaluation,
      span: span4,
      commit,
      workspace,
    })

    const validResult2 = await factories.createEvaluationResultV2({
      evaluation,
      span: span5,
      commit,
      workspace,
    })

    await database
      .update(evaluationResultsV2)
      .set({ type: null, metric: null })
      .where(eq(evaluationResultsV2.id, orphanedResult1.id))

    await database
      .update(evaluationResultsV2)
      .set({ type: EvaluationType.Rule, metric: null })
      .where(eq(evaluationResultsV2.id, orphanedResult2.id))

    await database
      .update(evaluationResultsV2)
      .set({ type: null, metric: RuleEvaluationMetric.ExactMatch })
      .where(eq(evaluationResultsV2.id, orphanedResult3.id))

    const resultsBeforeCleanup = await database
      .select()
      .from(evaluationResultsV2)
      .where(eq(evaluationResultsV2.workspaceId, workspace.id))

    expect(resultsBeforeCleanup.length).toBe(5)

    const mockJob = { data: {} } as Job

    const result = await cleanupOrphanedEvaluationResultsJob(mockJob)

    expect(result.deletedCount).toBeGreaterThanOrEqual(3)

    const remainingResults = await database
      .select()
      .from(evaluationResultsV2)
      .where(eq(evaluationResultsV2.workspaceId, workspace.id))

    expect(remainingResults.length).toBe(2)
    expect(remainingResults.map((r) => r.id).sort()).toEqual(
      [validResult1.id, validResult2.id].sort(),
    )

    const orphanedIds = [
      orphanedResult1.id,
      orphanedResult2.id,
      orphanedResult3.id,
    ]
    const orphanedRemaining = await database
      .select()
      .from(evaluationResultsV2)
      .where(inArray(evaluationResultsV2.id, orphanedIds))

    expect(orphanedRemaining.length).toBe(0)
  })

  it('should not delete anything when all evaluation results have type and metric', async () => {
    const span1 = await factories.createSpan({
      workspaceId: workspace.id,
      documentUuid: document.documentUuid,
      commitUuid: commit.uuid,
      type: SpanType.Prompt,
    })

    const span2 = await factories.createSpan({
      workspaceId: workspace.id,
      documentUuid: document.documentUuid,
      commitUuid: commit.uuid,
      type: SpanType.Prompt,
    })

    const validResult1 = await factories.createEvaluationResultV2({
      evaluation,
      span: span1,
      commit,
      workspace,
    })

    const validResult2 = await factories.createEvaluationResultV2({
      evaluation,
      span: span2,
      commit,
      workspace,
    })

    const resultsBeforeCleanup = await database
      .select()
      .from(evaluationResultsV2)
      .where(eq(evaluationResultsV2.workspaceId, workspace.id))

    expect(resultsBeforeCleanup.length).toBe(2)

    const mockJob = { data: {} } as Job

    const result = await cleanupOrphanedEvaluationResultsJob(mockJob)

    expect(result.deletedCount).toBeGreaterThanOrEqual(0)

    const remainingResults = await database
      .select()
      .from(evaluationResultsV2)
      .where(eq(evaluationResultsV2.workspaceId, workspace.id))

    expect(remainingResults.length).toBe(2)
    expect(remainingResults.map((r) => r.id).sort()).toEqual(
      [validResult1.id, validResult2.id].sort(),
    )
  })
})
