import {
  ConnectedEvaluation,
  DocumentVersion,
  EvaluationDto,
  EvaluationResultTmp,
  EvaluationV2,
} from '@latitude-data/core/browser'
import { DocumentLogWithMetadata } from '@latitude-data/core/repositories'
import {
  type ICommitContextType,
  type IProjectContextType,
} from '@latitude-data/web-ui'

export type EvaluationTmp =
  | (EvaluationDto & { live: ConnectedEvaluation['live']; version: 'v1' })
  | (EvaluationV2 & { version: 'v2' })

export type Props = {
  results: Record<string, EvaluationResultTmp>
  evaluations: EvaluationTmp[]
  document: DocumentVersion
  commit: ICommitContextType['commit']
  project: IProjectContextType['project']
  runCount: number
  isLoading: boolean
  isWaiting: boolean
}

export type Snapshot = {
  documentLog: DocumentLogWithMetadata
  evaluations: Props['evaluations']
}
