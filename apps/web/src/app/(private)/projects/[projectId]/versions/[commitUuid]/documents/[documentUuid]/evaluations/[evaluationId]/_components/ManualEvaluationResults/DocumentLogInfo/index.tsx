import { RefObject } from 'react'

import {
  EvaluationDto,
  EvaluationResultableType,
  ProviderLogDto,
} from '@latitude-data/core/browser'
import { StickyOffset } from '$/hooks/useStickyNested'

import { DocumentLogWithMetadataAndErrorAndEvaluationResult } from '..'
import { DocumentLogInfo } from '../../../../../logs/_components/DocumentLogs/DocumentLogInfo'
import { SubmitEvaluationResultBoolean } from './SubmitEvaluationResultBoolean'
import { SubmitEvaluationResultNumber } from './SubmitEvaluationResultNumber'
import { SubmitEvaluationResultText } from './SubmitEvaluationResultText'

export function DocumentLogInfoForManualEvaluation({
  evaluation,
  documentLog,
  providerLogs,
  stickyRef,
  sidebarWrapperRef,
  offset,
}: {
  evaluation: EvaluationDto
  documentLog: DocumentLogWithMetadataAndErrorAndEvaluationResult
  providerLogs?: ProviderLogDto[]
  stickyRef: RefObject<HTMLTableElement>
  sidebarWrapperRef: RefObject<HTMLDivElement>
  offset: StickyOffset
}) {
  if (documentLog.error.message) {
    return (
      <DocumentLogInfo
        documentLog={documentLog}
        providerLogs={providerLogs}
        stickyRef={stickyRef}
        sidebarWrapperRef={sidebarWrapperRef}
        offset={offset}
      />
    )
  }

  return (
    <DocumentLogInfo
      documentLog={documentLog}
      providerLogs={providerLogs}
      stickyRef={stickyRef}
      sidebarWrapperRef={sidebarWrapperRef}
      offset={offset}
    >
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
