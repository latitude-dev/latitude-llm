import { Job } from 'bullmq'
import { eq, inArray, sql } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { database } from '../../../client'
import { EvaluationType, RuleEvaluationMetric } from '../../../constants'
import { Providers } from '@latitude-data/constants'
import { evaluationResultsV2 } from '../../../schema/models/evaluationResultsV2'
import * as factories from '../../../tests/factories'
import { backfillEvaluationResultsTypeAndMetricJob } from './backfillEvaluationResultsTypeAndMetricJob'

describe('backfillEvaluationResultsTypeAndMetricJob', () => {
  let workspace: any
  let commit: any
  let document: any
  let evaluation: any
  let span: any

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
    })

    span = await factories.createSpan({
      workspaceId: workspace.id,
    })
  })

  it('should backfill results within the given ID range', async () => {
    const result = await factories.createEvaluationResultV2({
      evaluation,
      span,
      commit,
      workspace,
    })

    // Clear the evaluationType to simulate a result created before the migration
    await database
      .update(evaluationResultsV2)
      .set({
        type: sql`NULL`,
        metric: sql`NULL`,
      })
      .where(eq(evaluationResultsV2.id, result.id))

    // Verify it's NULL before the job runs
    const beforeJob = await database
      .select()
      .from(evaluationResultsV2)
      .where(eq(evaluationResultsV2.id, result.id))
      .then((r) => r[0])
    expect(beforeJob?.type).toBeNull()
    expect(beforeJob?.metric).toBeNull()

    const mockJob = {
      data: { minId: result.id, maxId: result.id + 100 },
    } as Job<{ minId: number; maxId: number }>

    await backfillEvaluationResultsTypeAndMetricJob(mockJob)

    // Verify the result was updated in the database
    const afterJob = await database
      .select()
      .from(evaluationResultsV2)
      .where(eq(evaluationResultsV2.id, result.id))
      .then((r) => r[0])

    expect(afterJob?.type).toBe(EvaluationType.Rule)
    expect(afterJob?.metric).toBe(RuleEvaluationMetric.ExactMatch)
  })

  it('should skip results outside the ID range', async () => {
    const result = await factories.createEvaluationResultV2({
      evaluation,
      span,
      commit,
      workspace,
    })

    // Clear the evaluationType
    await database
      .update(evaluationResultsV2)
      .set({
        type: sql`NULL`,
        metric: sql`NULL`,
      })
      .where(eq(evaluationResultsV2.id, result.id))

    // Use an ID range that doesn't include the result
    const mockJob = {
      data: { minId: result.id + 1000, maxId: result.id + 2000 },
    } as Job<{ minId: number; maxId: number }>

    await backfillEvaluationResultsTypeAndMetricJob(mockJob)

    // Verify the result was NOT updated - still NULL in database
    const afterJob = await database
      .select()
      .from(evaluationResultsV2)
      .where(eq(evaluationResultsV2.id, result.id))
      .then((r) => r[0])

    expect(afterJob?.type).toBeNull()
    expect(afterJob?.metric).toBeNull()
  })

  it('should skip results that already have evaluationType set', async () => {
    const result = await factories.createEvaluationResultV2({
      evaluation,
      span,
      commit,
      workspace,
    })

    // The result should already have evaluationType set by the factory
    const beforeJob = await database
      .select()
      .from(evaluationResultsV2)
      .where(eq(evaluationResultsV2.id, result.id))
      .then((r) => r[0])
    expect(beforeJob?.type).toBe(EvaluationType.Rule)

    const mockJob = {
      data: { minId: result.id, maxId: result.id + 100 },
    } as Job<{ minId: number; maxId: number }>

    await backfillEvaluationResultsTypeAndMetricJob(mockJob)

    // Verify the result still has the same values (not modified)
    const afterJob = await database
      .select()
      .from(evaluationResultsV2)
      .where(eq(evaluationResultsV2.id, result.id))
      .then((r) => r[0])

    expect(afterJob?.type).toBe(EvaluationType.Rule)
    expect(afterJob?.metric).toBe(RuleEvaluationMetric.ExactMatch)
  })

  it('should not create any records when range has no results', async () => {
    const mockJob = {
      data: { minId: 999999, maxId: 999999 + 100 },
    } as Job<{ minId: number; maxId: number }>

    await backfillEvaluationResultsTypeAndMetricJob(mockJob)

    // Verify no results exist in that range
    const results = await database
      .select()
      .from(evaluationResultsV2)
      .where(
        sql`${evaluationResultsV2.id} >= 999999 AND ${evaluationResultsV2.id} <= 999999 + 100`,
      )

    expect(results.length).toBe(0)
  })

  it('should handle multiple results in a single batch', async () => {
    const span2 = await factories.createSpan({
      workspaceId: workspace.id,
    })
    const span3 = await factories.createSpan({
      workspaceId: workspace.id,
    })

    const result1 = await factories.createEvaluationResultV2({
      evaluation,
      span,
      commit,
      workspace,
    })

    const result2 = await factories.createEvaluationResultV2({
      evaluation,
      span: span2,
      commit,
      workspace,
    })

    const result3 = await factories.createEvaluationResultV2({
      evaluation,
      span: span3,
      commit,
      workspace,
    })

    const resultIds = [result1.id, result2.id, result3.id]

    // Clear evaluationType for all results
    await database
      .update(evaluationResultsV2)
      .set({
        type: sql`NULL`,
        metric: sql`NULL`,
      })
      .where(inArray(evaluationResultsV2.id, resultIds))

    // Verify all are NULL before job runs
    const beforeJob = await database
      .select()
      .from(evaluationResultsV2)
      .where(inArray(evaluationResultsV2.id, resultIds))

    expect(beforeJob.every((r) => r.type === null)).toBe(true)
    expect(beforeJob.every((r) => r.metric === null)).toBe(true)

    const minId = Math.min(...resultIds)
    const maxId = Math.max(...resultIds)

    const mockJob = {
      data: { minId, maxId: maxId + 100 },
    } as Job<{ minId: number; maxId: number }>

    await backfillEvaluationResultsTypeAndMetricJob(mockJob)

    // Verify all results were updated in the database
    const afterJob = await database
      .select()
      .from(evaluationResultsV2)
      .where(inArray(evaluationResultsV2.id, resultIds))

    expect(afterJob.length).toBe(3)
    expect(afterJob.every((r) => r.type === EvaluationType.Rule)).toBe(true)
    expect(
      afterJob.every((r) => r.metric === RuleEvaluationMetric.ExactMatch),
    ).toBe(true)
  })

  it('should only update results with NULL evaluationType', async () => {
    const span2 = await factories.createSpan({
      workspaceId: workspace.id,
    })

    const resultWithType = await factories.createEvaluationResultV2({
      evaluation,
      span,
      commit,
      workspace,
    })

    const resultWithoutType = await factories.createEvaluationResultV2({
      evaluation,
      span: span2,
      commit,
      workspace,
    })

    // Only clear evaluationType for the second result
    await database
      .update(evaluationResultsV2)
      .set({
        type: sql`NULL`,
        metric: sql`NULL`,
      })
      .where(eq(evaluationResultsV2.id, resultWithoutType.id))

    const minId = Math.min(resultWithType.id, resultWithoutType.id)
    const maxId = Math.max(resultWithType.id, resultWithoutType.id)

    const mockJob = {
      data: { minId, maxId: maxId + 100 },
    } as Job<{ minId: number; maxId: number }>

    await backfillEvaluationResultsTypeAndMetricJob(mockJob)

    // Verify both results now have evaluationType set
    const afterJob = await database
      .select()
      .from(evaluationResultsV2)
      .where(
        inArray(evaluationResultsV2.id, [
          resultWithType.id,
          resultWithoutType.id,
        ]),
      )

    const withType = afterJob.find((r) => r.id === resultWithType.id)
    const withoutType = afterJob.find((r) => r.id === resultWithoutType.id)

    expect(withType?.type).toBe(EvaluationType.Rule)
    expect(withoutType?.type).toBe(EvaluationType.Rule)
  })
})
