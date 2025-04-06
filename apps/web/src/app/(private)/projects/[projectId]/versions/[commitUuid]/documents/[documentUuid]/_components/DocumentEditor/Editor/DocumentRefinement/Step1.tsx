import { DocumentVersion, EvaluationTmp } from '@latitude-data/core/browser'
import {
  ICommitContextType,
  IProjectContextType,
} from '@latitude-data/web-ui/providers'

export function Step1({
  project,
  commit,
  document,
  setEvaluation,
}: {
  project: IProjectContextType['project']
  commit: ICommitContextType['commit']
  document: DocumentVersion
  setEvaluation: (evaluation: EvaluationTmp) => void
}) {
  // TODO
  return <div>Step1</div>
}
