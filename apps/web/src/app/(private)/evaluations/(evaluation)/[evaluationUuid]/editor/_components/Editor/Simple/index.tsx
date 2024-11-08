'use client'

import {
  EvaluationDto,
  EvaluationResultableType,
} from '@latitude-data/core/browser'

import BooleanEvaluationEditor from './BooleanEvaluationEditor'
import NumberEvaluationEditor from './NumberEvaluationEditor'
import TextEvaluationEditor from './TextEvaluationEditor'

export default function SimpleEvaluationEditor({
  evaluation,
}: {
  evaluation: EvaluationDto
}) {
  switch (evaluation.resultType) {
    case EvaluationResultableType.Number:
      return <NumberEvaluationEditor evaluation={evaluation} />
    case EvaluationResultableType.Boolean:
      return <BooleanEvaluationEditor evaluation={evaluation} />
    case EvaluationResultableType.Text:
      return <TextEvaluationEditor evaluation={evaluation} />
    default:
    // do nothing
  }
}
