import {
  DocumentLogWithMetadata,
  EvaluationResultV2,
  EvaluationV2,
} from '@latitude-data/core/constants'
import { DocumentVersion } from '@latitude-data/core/schema/types'
import type { ICommitContextType } from '$/app/providers/CommitProvider'
import type { IProjectContextType } from '$/app/providers/ProjectProvider'

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
