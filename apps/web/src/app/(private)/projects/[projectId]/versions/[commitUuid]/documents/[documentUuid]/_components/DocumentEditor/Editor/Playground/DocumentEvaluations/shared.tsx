import {
  ConnectedEvaluation,
  DocumentVersion,
  EvaluationDto,
  EvaluationResultDto,
} from '@latitude-data/core/browser'
import {
  type ICommitContextType,
  type IProjectContextType,
} from '@latitude-data/web-ui'

export type Props = {
  results: Record<number, EvaluationResultDto>
  evaluations: (EvaluationDto & { live: ConnectedEvaluation['live'] })[]
  document: DocumentVersion
  commit: ICommitContextType['commit']
  project: IProjectContextType['project']
  runCount: number
  isLoading: boolean
  isWaiting: boolean
}
