import { EvaluationMetadataType, Workspace } from '@latitude-data/core/browser'
import { EvaluationsRepository } from '@latitude-data/core/repositories'
import { getEvaluationPrompt } from '@latitude-data/core/services/evaluations/index'
import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import { NextRequest, NextResponse } from 'next/server'

export const GET = errorHandler(
  authHandler(
    async (
      _: NextRequest,
      {
        params,
        workspace,
      }: {
        params: {
          evaluationId: number
        }
        workspace: Workspace
      },
    ) => {
      const { evaluationId } = params
      const evaluationsScope = new EvaluationsRepository(workspace.id)
      const evaluation = await evaluationsScope
        .find(evaluationId)
        .then((r) => r.unwrap())

      if (
        ![
          EvaluationMetadataType.LlmAsJudgeAdvanced,
          EvaluationMetadataType.LlmAsJudgeSimple,
        ].includes(evaluation.metadataType)
      ) {
        throw new Error('Only LLM as judge evaluations are supported')
      }

      const prompt = await getEvaluationPrompt({ workspace, evaluation })
      return NextResponse.json(prompt.unwrap(), { status: 200 })
    },
  ),
)
