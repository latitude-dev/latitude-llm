import {
  DocumentVersion,
  EvaluationResultTmp,
  EvaluationTmp,
} from '@latitude-data/core/browser'
import {
  ICommitContextType,
  IProjectContextType,
} from '@latitude-data/web-ui/providers'

export function Step2({
  project,
  commit,
  document,
  setEvaluation,
  setResults,
}: {
  project: IProjectContextType['project']
  commit: ICommitContextType['commit']
  document: DocumentVersion
  setEvaluation: (evaluation: EvaluationTmp) => void
  setResults: (results: EvaluationResultTmp[]) => void
}) {
  // TODO
  return <div>Step2</div>
}
