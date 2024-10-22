import { omit } from 'lodash-es'

import { describe, expect, it } from 'vitest'

import { EvaluationsRepository } from '.'
import {
  EvaluationMetadataType,
  EvaluationResultableType,
  Providers,
} from '../../browser'
import { database } from '../../client'
import {
  evaluationMetadataLlmAsJudgeBoolean,
  evaluationMetadataLlmAsJudgeCustom,
  evaluationMetadataLlmAsJudgeLegacy,
  evaluationMetadataLlmAsJudgeNumerical,
  evaluations,
} from '../../schema'
import { createProject } from '../../tests/factories'

describe('EvaluationRepository', () => {
  it('returns EvaluationDto for all evaluation types', async () => {
    const { workspace, providers } = await createProject({
      providers: [{ name: 'openai', type: Providers.OpenAI }],
    })

    const provider = providers[0]!

    // ------- Create evaluations -------

    // EvaluationMetadataLlmAsJudgeLegacy
    const metadataLlmAsJudgeLegacy = await database
      .insert(evaluationMetadataLlmAsJudgeLegacy)
      .values({
        prompt: 'foo',
        configuration: { type: EvaluationResultableType.Boolean },
      })
      .returning()

    await database.insert(evaluations).values({
      name: 'evaluationLlmAsJudgeLegacy',
      description: 'descriptionLegacy',
      metadataType: EvaluationMetadataType.LlmAsJudgeLegacy,
      metadataId: metadataLlmAsJudgeLegacy[0]!.id,
      workspaceId: workspace.id,
    })

    // EvaluationMetadataLlmAsJudgeBoolean
    const metadataLlmAsJudgeBoolean = await database
      .insert(evaluationMetadataLlmAsJudgeBoolean)
      .values({
        providerApiKeyId: provider.id,
        model: 'gpt-4o-mini',
        objective: 'booleanObjective',
        additionalInstructions: 'booleanInstructions',
        trueResultDescription: 'trueResultDescription',
        falseResultDescription: 'falseResultDescription',
      })
      .returning()

    await database.insert(evaluations).values({
      name: 'evaluationLlmAsJudgeBoolean',
      description: 'descriptionBoolean',
      metadataType: EvaluationMetadataType.LlmAsJudgeBoolean,
      metadataId: metadataLlmAsJudgeBoolean[0]!.id,
      workspaceId: workspace.id,
    })

    // EvaluationMetadataLlmAsJudgeNumerical
    const metadataLlmAsJudgeNumerical = await database
      .insert(evaluationMetadataLlmAsJudgeNumerical)
      .values({
        providerApiKeyId: provider.id,
        model: 'gpt-4o-mini',
        objective: 'numericalObjective',
        additionalInstructions: 'numericalInstructions',
        minValue: 0,
        maxValue: 100,
        minValueDescription: 'minValueDescription',
        maxValueDescription: 'maxValueDescription',
      })
      .returning()

    await database.insert(evaluations).values({
      name: 'evaluationLlmAsJudgeNumerical',
      description: 'descriptionNumerical',
      metadataType: EvaluationMetadataType.LlmAsJudgeNumerical,
      metadataId: metadataLlmAsJudgeNumerical[0]!.id,
      workspaceId: workspace.id,
    })

    // EvaluationMetadataLlmAsJudgeCustom
    const metadataLlmAsJudgeCustom = await database
      .insert(evaluationMetadataLlmAsJudgeCustom)
      .values({
        providerApiKeyId: provider.id,
        model: 'gpt-4o-mini',
        objective: 'customObjective',
        additionalInstructions: 'customInstructions',
      })
      .returning()

    await database.insert(evaluations).values({
      name: 'evaluationLlmAsJudgeCustom',
      description: 'descriptionCustom',
      metadataType: EvaluationMetadataType.LlmAsJudgeCustom,
      metadataId: metadataLlmAsJudgeCustom[0]!.id,
      workspaceId: workspace.id,
    })

    const repository = new EvaluationsRepository(workspace.id)
    const allEvaluations = await repository.findAll().then((r) => r.unwrap())

    expect(allEvaluations.length).toBe(4)

    const legacyEvals = allEvaluations.filter(
      (e) => e.metadataType === EvaluationMetadataType.LlmAsJudgeLegacy,
    )
    expect(legacyEvals.length).toBe(1)
    expect(legacyEvals[0]!.metadata).toMatchObject(
      omit(metadataLlmAsJudgeLegacy[0]!, ['id', 'createdAt', 'updatedAt']),
    )

    const booleanEvals = allEvaluations.filter(
      (e) => e.metadataType === EvaluationMetadataType.LlmAsJudgeBoolean,
    )
    expect(booleanEvals.length).toBe(1)
    expect(booleanEvals[0]!.metadata).toMatchObject(
      omit(metadataLlmAsJudgeBoolean[0]!, ['id', 'createdAt', 'updatedAt']),
    )

    const numericalEvals = allEvaluations.filter(
      (e) => e.metadataType === EvaluationMetadataType.LlmAsJudgeNumerical,
    )
    expect(numericalEvals.length).toBe(1)
    expect(numericalEvals[0]!.metadata).toMatchObject(
      omit(metadataLlmAsJudgeNumerical[0]!, ['id', 'createdAt', 'updatedAt']),
    )

    const customEvals = allEvaluations.filter(
      (e) => e.metadataType === EvaluationMetadataType.LlmAsJudgeCustom,
    )
    expect(customEvals.length).toBe(1)
    expect(customEvals[0]!.metadata).toMatchObject(
      omit(metadataLlmAsJudgeCustom[0]!, ['id', 'createdAt', 'updatedAt']),
    )
  })
})
