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
  variants: {
    name: string
    prompt: string
    parameters: string[]
  }[]
  setVariants: ReactStateDispatch<
    {
      name: string
      prompt: string
      parameters: string[]
    }[]
  >
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
  const [variants, setVariants] = useState<
    {
      name: string
      prompt: string
      parameters: string[]
    }[]
  >([
    {
      name: '',
      prompt: document.content,
      parameters: [],
    },
  ])
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
    variants,
    setVariants,
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
