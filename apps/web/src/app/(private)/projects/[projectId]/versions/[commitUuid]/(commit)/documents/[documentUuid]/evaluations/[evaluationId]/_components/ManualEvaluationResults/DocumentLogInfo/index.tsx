import {
  EvaluationDto,
  EvaluationResultableType,
  ProviderLogDto,
} from '@latitude-data/core/browser'

import { DocumentLogWithMetadataAndErrorAndEvaluationResult } from '..'
import { DocumentLogInfo } from '../../../../../logs/_components/DocumentLogs/DocumentLogInfo'
import { SubmitEvaluationResultBoolean } from './SubmitEvaluationResultBoolean'
import { SubmitEvaluationResultNumber } from './SubmitEvaluationResultNumber'
import { SubmitEvaluationResultText } from './SubmitEvaluationResultText'

export function DocumentLogInfoForManualEvaluation({
  evaluation,
  documentLog,
  providerLogs,
}: {
  evaluation: EvaluationDto
  documentLog: DocumentLogWithMetadataAndErrorAndEvaluationResult
  providerLogs?: ProviderLogDto[]
}) {
  return (
    <DocumentLogInfo documentLog={documentLog} providerLogs={providerLogs}>
      <SubmitEvaluationResult
        documentLog={documentLog}
        evaluation={evaluation}
      />
    </DocumentLogInfo>
  )
}

function SubmitEvaluationResult({
  documentLog,
  evaluation,
}: {
  documentLog: DocumentLogWithMetadataAndErrorAndEvaluationResult
  evaluation: EvaluationDto
}) {
  switch (evaluation.resultType) {
    case EvaluationResultableType.Number:
      return (
        <SubmitEvaluationResultNumber
          documentLog={documentLog}
          evaluation={evaluation}
          result={documentLog.result}
        />
      )
    case EvaluationResultableType.Boolean:
      return (
        <SubmitEvaluationResultBoolean
          documentLog={documentLog}
          evaluation={evaluation}
          result={documentLog.result}
        />
      )
    case EvaluationResultableType.Text:
      return (
        <SubmitEvaluationResultText
          documentLog={documentLog}
          evaluation={evaluation}
          result={documentLog.result}
        />
      )
  }
}
