import { useCallback, useEffect, useMemo, useState } from 'react'
import type {
  Commit,
  Dataset,
  DocumentVersion,
  EvaluationV2,
  Project,
} from '@latitude-data/core/browser'
import type { ReactStateDispatch } from '@latitude-data/web-ui/commonTypes'
import { useMetadata } from '$/hooks/useMetadata'

export type ExperimentFormPayload = {
  project: Project
  commit: Commit
  document: DocumentVersion
  isLoadingMetadata: boolean
  variants: {
    name: string
    provider: string
    model: string
    temperature: number
  }[]
  setVariants: ReactStateDispatch<
    {
      name: string
      provider: string
      model: string
      temperature: number
    }[]
  >
  addNewVariant: () => void
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
  parameters: string[]
}

export function useExperimentFormPayload({
  project,
  commit,
  document,
  initialEvaluation,
  experimentCount,
}: {
  project: Project
  commit: Commit
  document: DocumentVersion
  initialEvaluation?: EvaluationV2
  experimentCount?: number
}): ExperimentFormPayload {
  const { metadata, updateMetadata } = useMetadata()
  useEffect(() => {
    updateMetadata({
      promptlVersion: document.promptlVersion,
      prompt: document.content,
      document,
    })
  }, [document, updateMetadata])

  const parameters = useMemo(() => {
    return Array.from(metadata?.parameters ?? [])
  }, [metadata])
  const [selectedDataset, setSelectedDataset] = useState<Dataset>()
  const [fromLine, setFromLine] = useState<number>()
  const [toLine, setToLine] = useState<number>()
  const [parametersMap, setParametersMap] = useState<Record<string, number>>({})
  const [selectedEvaluations, setSelectedEvaluations] = useState<EvaluationV2[]>(
    initialEvaluation ? [initialEvaluation] : [],
  )
  const [datasetLabels, setDatasetLabels] = useState<Record<string, string>>({})

  const [variants, setVariants] = useState<
    {
      name: string
      provider: string
      model: string
      temperature: number
    }[]
  >([])
  const addNewVariant = useCallback(() => {
    setVariants((prev) => {
      const newVariants = [...prev]
      const model = metadata?.config?.model as string | undefined

      const name = [
        experimentCount ? `#${experimentCount + 1}` : undefined, // Experiment number
        `v${newVariants.length + 1}`, // Variant number
        model ? `— ${model}` : undefined, // Model name
      ]
        .filter(Boolean)
        .join(' ')

      newVariants.push({
        name,
        provider: (metadata?.config?.provider as string) ?? '',
        model: (metadata?.config?.model as string) ?? '',
        temperature: (metadata?.config?.temperature as number) ?? 1,
      })
      return newVariants
    })
  }, [experimentCount, metadata])

  return {
    project,
    commit,
    document,
    isLoadingMetadata: metadata === undefined,
    variants,
    setVariants,
    addNewVariant,
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
    parameters,
  }
}
