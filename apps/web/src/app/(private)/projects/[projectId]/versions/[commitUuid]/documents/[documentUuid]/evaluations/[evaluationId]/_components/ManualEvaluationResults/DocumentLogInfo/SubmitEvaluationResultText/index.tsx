import { useState } from 'react'

import {
  EvaluationDto,
  EvaluationResultableType,
  EvaluationResultDto,
} from '@latitude-data/core/browser'
import { TextArea } from '@latitude-data/web-ui/atoms/TextArea'

import { DocumentLogWithMetadataAndErrorAndEvaluationResult } from '../..'
import { BaseEvaluationResult } from '../BaseEvaluationResult'

export function SubmitEvaluationResultText({
  documentLog,
  evaluation,
  result,
}: {
  documentLog: DocumentLogWithMetadataAndErrorAndEvaluationResult
  evaluation: EvaluationDto
  result: EvaluationResultDto | undefined
}) {
  const [value, setValue] = useState<string>(
    result?.result ? String(result.result) : '',
  )

  return (
    <BaseEvaluationResult
      documentLog={documentLog}
      evaluation={evaluation}
      result={result}
      type={EvaluationResultableType.Text}
      value={value}
    >
      <TextArea
        name='value'
        placeholder='Enter your evaluation'
        onChange={(e) => setValue(e.target.value)}
        defaultValue={result?.result as string}
        minRows={1}
        required
      />
    </BaseEvaluationResult>
  )
}
