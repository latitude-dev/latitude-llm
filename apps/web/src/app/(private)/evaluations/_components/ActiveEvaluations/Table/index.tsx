'use client'

import {
  EvaluationMetadataType,
  EvaluationResultableType,
} from '@latitude-data/core/browser'

export const evaluationMetadataTypes = {
  [EvaluationMetadataType.LlmAsJudgeSimple]: 'LLM as judge',
  [EvaluationMetadataType.LlmAsJudgeAdvanced]: 'LLM as judge',
  [EvaluationMetadataType.Manual]: 'Code / Manual',
}

export const evaluationResultTypes = {
  [EvaluationResultableType.Boolean]: 'Boolean',
  [EvaluationResultableType.Number]: 'Number',
  [EvaluationResultableType.Text]: 'Text',
}
