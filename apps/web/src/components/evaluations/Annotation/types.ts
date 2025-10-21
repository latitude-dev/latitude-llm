import useEvaluationResultsV2ByDocumentLogs from '$/stores/evaluationResultsV2/byDocumentLogs'
import { useEvaluationsV2 } from '$/stores/evaluationsV2'
import {
  EvaluationType,
  EvaluationMetric,
  DocumentLog,
} from '@latitude-data/constants'
import { AnnotationFormProps } from '../index'
import { Commit } from '@latitude-data/core/schema/models/types/Commit'
import { ProviderLogDto } from '@latitude-data/core/schema/types'

export type FormProps<
  T extends EvaluationType,
  M extends EvaluationMetric<T>,
> = AnnotationFormProps<T, M> & {
  mutateEvaluationResults: ReturnType<
    typeof useEvaluationResultsV2ByDocumentLogs
  >['mutate']
  annotateEvaluation: ReturnType<typeof useEvaluationsV2>['annotateEvaluation']
  isAnnotatingEvaluation: boolean
  commit: Commit
  providerLog: ProviderLogDto
  documentLog: DocumentLog
}
