import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'

import { database } from '../../client'
import { EvaluationResultableType, Providers } from '../../constants'
import {
  evaluationResultableBooleans,
  evaluationResultableNumbers,
  evaluationResultableTexts,
  evaluationResults,
} from '../../schema'
import * as factories from '../../tests/factories'
import { createEvaluationResult } from './create'

async function setupTest(configurationType: EvaluationResultableType) {
  const { workspace, project, user, providers } = await factories.createProject(
    { providers: [{ name: 'foo', type: Providers.OpenAI }] },
  )
  const provider = providers[0]
  const evaluation = await factories.createLlmAsJudgeEvaluation({
    workspace,
    configuration: {
      type: configurationType,
      ...(configurationType === EvaluationResultableType.Number
        ? { detail: { range: { from: 0, to: 100 } } }
        : {}),
    },
  })
  const { commit } = await factories.createDraft({ project, user })
  const { documentVersion } = await factories.createDocumentVersion({
    commit,
    path: 'folder1/doc1',
    content: `
      ---
      provider: ${provider!.name}
      model: 'gpt-4o-mini'
      ---
    `,
  })
  const { documentLog } = await factories.createDocumentLog({
    document: documentVersion,
    commit,
  })
  const providerLog = await factories.createProviderLog({
    providerId: provider!.id,
    providerType: provider!.provider,
    documentLogUuid: documentLog.uuid,
  })

  return { evaluation, documentLog, providerLog }
}

describe('createEvaluationResult', () => {
  it('creates a boolean evaluation result', async () => {
    const { evaluation, documentLog, providerLog } = await setupTest(
      EvaluationResultableType.Boolean,
    )

    const result = await createEvaluationResult({
      evaluation,
      documentLog,
      providerLog,
      result: {
        result: true,
        reason: 'This is a boolean result',
      },
    })

    expect(result.ok).toBe(true)
    if (result.error) return

    expect(result.value.evaluationId).toBe(evaluation.id)
    expect(result.value.documentLogId).toBe(documentLog.id)
    expect(result.value.providerLogId).toBe(providerLog.id)
    expect(result.value.resultableType).toBe(EvaluationResultableType.Boolean)
    expect(result.value.result).toBe(true)
    // Verify in database
    const dbResult = await database.query.evaluationResults.findFirst({
      where: eq(evaluationResults.id, result.value.id),
    })
    expect(dbResult).toBeDefined()
    expect(dbResult?.resultableType).toBe(EvaluationResultableType.Boolean)

    const booleanResult =
      await database.query.evaluationResultableBooleans.findFirst({
        where: eq(evaluationResultableBooleans.id, dbResult!.resultableId),
      })
    expect(booleanResult).toBeDefined()
    expect(booleanResult?.result).toBe(true)
  })

  it('creates a number evaluation result', async () => {
    const { evaluation, documentLog, providerLog } = await setupTest(
      EvaluationResultableType.Number,
    )

    const result = await createEvaluationResult({
      evaluation,
      documentLog,
      providerLog,
      result: {
        result: 75,
        reason: 'This is a number result',
      },
    })

    expect(result.ok).toBe(true)
    if (result.error) return

    expect(result.value.evaluationId).toBe(evaluation.id)
    expect(result.value.documentLogId).toBe(documentLog.id)
    expect(result.value.providerLogId).toBe(providerLog.id)
    expect(result.value.resultableType).toBe(EvaluationResultableType.Number)
    expect(result.value.result).toBe(75)
    // Verify in database
    const dbResult = await database.query.evaluationResults.findFirst({
      where: eq(evaluationResults.id, result.value.id),
    })
    expect(dbResult).toBeDefined()
    expect(dbResult?.resultableType).toBe(EvaluationResultableType.Number)

    const numberResult =
      await database.query.evaluationResultableNumbers.findFirst({
        where: eq(evaluationResultableNumbers.id, dbResult!.resultableId),
      })
    expect(numberResult).toBeDefined()
    expect(numberResult?.result).toBe(75)
  })

  it('creates a text evaluation result', async () => {
    const { evaluation, documentLog, providerLog } = await setupTest(
      EvaluationResultableType.Text,
    )

    const result = await createEvaluationResult({
      evaluation,
      documentLog,
      providerLog,
      result: {
        result: 'This is a text result',
        reason: 'Explanation for the text result',
      },
    })

    expect(result.ok).toBe(true)
    if (result.error) return

    expect(result.value.evaluationId).toBe(evaluation.id)
    expect(result.value.documentLogId).toBe(documentLog.id)
    expect(result.value.providerLogId).toBe(providerLog.id)
    expect(result.value.resultableType).toBe(EvaluationResultableType.Text)
    expect(result.value.result).toBe('This is a text result')
    // Verify in database
    const dbResult = await database.query.evaluationResults.findFirst({
      where: eq(evaluationResults.id, result.value.id),
    })
    expect(dbResult).toBeDefined()
    expect(dbResult?.resultableType).toBe(EvaluationResultableType.Text)

    const textResult = await database.query.evaluationResultableTexts.findFirst(
      {
        where: eq(evaluationResultableTexts.id, dbResult!.resultableId),
      },
    )
    expect(textResult).toBeDefined()
    expect(textResult?.result).toBe('This is a text result')
  })

  it('returns an error for unsupported result type', async () => {
    const { evaluation, documentLog, providerLog } = await setupTest(
      'UnsupportedType' as any,
    )

    const result = await createEvaluationResult({
      evaluation,
      documentLog,
      providerLog,
      result: {
        result: 'Some result',
        reason: 'Some reason',
      },
    })

    expect(result.ok).toBe(false)
    if (result.error) {
      expect(result.error.message).toContain('Unsupported result type')
    }
  })
})
