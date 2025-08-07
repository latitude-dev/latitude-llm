import type {
  DocumentLogWithMetadata,
  DocumentVersion,
  EvaluationResultV2,
  EvaluationV2,
} from '@latitude-data/core/browser'
import type { ICommitContextType, IProjectContextType } from '@latitude-data/web-ui/providers'

export type Props = {
  results: Record<string, EvaluationResultV2>
  evaluations: EvaluationV2[]
  document: DocumentVersion
  commit: ICommitContextType['commit']
  project: IProjectContextType['project']
  runCount: number
  isLoading: boolean
  isWaiting: boolean
  documentLog: DocumentLogWithMetadata | undefined
}

export type Snapshot = {
  documentLog: DocumentLogWithMetadata
  evaluations: Props['evaluations']
}
