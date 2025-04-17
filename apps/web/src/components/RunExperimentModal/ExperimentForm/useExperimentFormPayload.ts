import { useState } from 'react'
import {
  Commit,
  Dataset,
  DocumentVersion,
  EvaluationV2,
  Project,
} from '@latitude-data/core/browser'
import { ReactStateDispatch } from '@latitude-data/web-ui/commonTypes'

export type ExperimentFormPayload = {
  project: Project
  commit: Commit
  document: DocumentVersion
  name: string
  setName: ReactStateDispatch<string>
  selectedDataset?: Dataset
  onSelectDataset: (dataset: Dataset) => void
  fromLine?: number
  toLine?: number
  setFromLine: (line?: number) => void
  setToLine: (line?: number) => void
  parametersMap: Record<string, number>
  setParametersMap: ReactStateDispatch<Record<string, number>>
  selectedEvaluations: EvaluationV2[]
  setSelectedEvaluations: ReactStateDispatch<EvaluationV2[]>
  datasetLabels: Record<string, string>
  setDatasetLabels: ReactStateDispatch<Record<string, string>>
}

export function useExperimentFormPayload({
  project,
  commit,
  document,
  initialEvaluation,
}: {
  project: Project
  commit: Commit
  document: DocumentVersion
  initialEvaluation?: EvaluationV2
}): ExperimentFormPayload {
  const [name, setName] = useState<string>('')
  const [selectedDataset, setSelectedDataset] = useState<Dataset>()
  const [fromLine, setFromLine] = useState<number>()
  const [toLine, setToLine] = useState<number>()
  const [parametersMap, setParametersMap] = useState<Record<string, number>>({})
  const [selectedEvaluations, setSelectedEvaluations] = useState<
    EvaluationV2[]
  >(initialEvaluation ? [initialEvaluation] : [])
  const [datasetLabels, setDatasetLabels] = useState<Record<string, string>>({})

  return {
    project,
    commit,
    document,
    name,
    setName,
    selectedDataset,
    onSelectDataset: setSelectedDataset,
    fromLine,
    toLine,
    setFromLine,
    setToLine,
    parametersMap,
    setParametersMap,
    selectedEvaluations,
    setSelectedEvaluations,
    datasetLabels,
    setDatasetLabels,
  }
}
