import { useState } from 'react'

import {
  EvaluationConfigurationNumerical,
  EvaluationDto,
  EvaluationResultableType,
  EvaluationResultDto,
} from '@latitude-data/core/browser'
import { Input, TabSelector } from '@latitude-data/web-ui'

import { DocumentLogWithMetadataAndErrorAndEvaluationResult } from '../..'
import { BaseEvaluationResult } from '../BaseEvaluationResult'

export function SubmitEvaluationResultNumber({
  documentLog,
  evaluation,
  result,
}: {
  documentLog: DocumentLogWithMetadataAndErrorAndEvaluationResult
  evaluation: EvaluationDto
  result: EvaluationResultDto | undefined
}) {
  const [selected, setSelected] = useState<string | undefined>(
    result?.result ? String(result.result as number) : undefined,
  )
  const configuration =
    evaluation.resultConfiguration as EvaluationConfigurationNumerical

  let input
  if (configuration.maxValue - configuration.minValue <= 10) {
    const numbers = Array.from(
      { length: configuration.maxValue - configuration.minValue + 1 },
      (_, i) => i + configuration.minValue,
    )
    input = (
      <TabSelector
        fullWidth
        options={numbers.map((value) => ({
          label: String(value),
          value: String(value),
        }))}
        selected={selected}
        onSelect={setSelected}
      />
    )
  } else {
    input = (
      <Input
        type='number'
        name='result'
        defaultValue={result?.result as number}
        onChange={(e) => setSelected(e.target.value)}
      />
    )
  }

  return (
    <BaseEvaluationResult
      documentLog={documentLog}
      evaluation={evaluation}
      result={result}
      type={EvaluationResultableType.Number}
      value={selected ? Number(selected) : undefined}
    >
      {input}
    </BaseEvaluationResult>
  )
}
