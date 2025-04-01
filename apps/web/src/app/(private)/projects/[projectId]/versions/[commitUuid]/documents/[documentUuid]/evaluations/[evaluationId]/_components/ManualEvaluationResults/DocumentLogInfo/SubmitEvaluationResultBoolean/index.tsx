import { useState } from 'react'

import {
  EvaluationDto,
  EvaluationResultableType,
  EvaluationResultDto,
} from '@latitude-data/core/browser'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { TabSelector } from '@latitude-data/web-ui/molecules/TabSelector'

import { DocumentLogWithMetadataAndErrorAndEvaluationResult } from '../..'
import { BaseEvaluationResult } from '../BaseEvaluationResult'

export function SubmitEvaluationResultBoolean({
  documentLog,
  evaluation,
  result,
}: {
  documentLog: DocumentLogWithMetadataAndErrorAndEvaluationResult
  evaluation: EvaluationDto
  result: EvaluationResultDto | undefined
}) {
  const [selected, setSelected] = useState<string | undefined>(
    result?.result ? String(result.result) : undefined,
  )

  return (
    <BaseEvaluationResult
      documentLog={documentLog}
      evaluation={evaluation}
      result={result}
      type={EvaluationResultableType.Boolean}
      value={selected ? selected === 'true' : undefined}
    >
      <TabSelector
        fullWidth
        options={[
          {
            label: <Icon name='thumbsUp' />,
            value: 'true',
          },
          {
            label: <Icon name='thumbsDown' />,
            value: 'false',
          },
        ]}
        selected={selected}
        onSelect={setSelected}
      />
    </BaseEvaluationResult>
  )
}
