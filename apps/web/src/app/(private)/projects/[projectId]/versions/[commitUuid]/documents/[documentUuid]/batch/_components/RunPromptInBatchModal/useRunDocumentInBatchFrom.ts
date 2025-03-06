import { useCallback, useEffect, useMemo, useState } from 'react'
import { readMetadata } from '@latitude-data/compiler'
import { Dataset, DocumentVersion } from '@latitude-data/core/browser'
import { scan, type ConversationMetadata } from 'promptl-ai'
import { SelectOption } from '@latitude-data/web-ui'
import useDatasets from '$/stores/datasets'
import { buildEmptyParameters } from '../../../evaluations/[evaluationId]/_components/Actions/CreateBatchEvaluationModal/useRunBatchForm'
import { useMappedParametersFromLocalStorage } from './useMappedParametersFromLocalStorage'
import { RunBatchParameters } from '$/app/(private)/projects/[projectId]/versions/[commitUuid]/documents/[documentUuid]/evaluations/[evaluationId]/_components/Actions/CreateBatchEvaluationModal/useRunBatch'

export function useRunDocumentInBatchForm({
  document,
  commitVersionUuid,
}: {
  document: DocumentVersion
  commitVersionUuid: string
}) {
  const [metadata, setMetadata] = useState<ConversationMetadata | undefined>()
  const parametersList = useMemo(
    () => Array.from(metadata?.parameters ?? []),
    [metadata?.parameters],
  )
  const [selectedDataset, setSelectedDataset] = useState<Dataset | null>(null)
  const [headers, setHeaders] = useState<SelectOption<string>[]>([])
  const [wantAllLines, setAllRows] = useState(true)
  const [fromLine, setFromLine] = useState<number | undefined>(undefined)
  const [toLine, setToLine] = useState<number | undefined>(undefined)
  const [parameters, setParameters] = useState(() =>
    buildEmptyParameters(parametersList),
  )
  const onParameterChange = useCallback(
    (param: string) => (header: string) => {
      setParameters((prev: RunBatchParameters) => ({
        ...prev,
        [param]: selectedDataset?.fileMetadata?.headers?.indexOf?.(header),
      }))
    },
    [selectedDataset],
  )

  const buildHeaders = useCallback(
    (dataset: Dataset) => {
      setHeaders([
        { value: '-1', label: '-- Leave this parameter empty' },
        ...dataset.fileMetadata.headers.map((header) => ({
          value: header,
          label: header,
        })),
      ])
    },
    [setHeaders, selectedDataset],
  )

  const { data: datasets, isLoading: isLoadingDatasets } = useDatasets()
  const onSelectDataset = useCallback(
    async (value: number) => {
      const ds = datasets.find((ds) => ds.id === Number(value))
      if (!ds) return

      setSelectedDataset(ds)
      setParameters(buildEmptyParameters(parametersList))
      setFromLine(1)
      setToLine(ds.fileMetadata.rowCount)
      buildHeaders(ds)
    },
    [parametersList, datasets, buildHeaders],
  )

  useEffect(() => {
    const fn = async () => {
      if (!document || !document.content) return

      // TODO: Include referenceFn, otherwise it will fail if the prompt contains references
      const metadata =
        document.promptlVersion === 0
          ? await readMetadata({
              prompt: document.content,
            })
          : await scan({ prompt: document.content })

      setMetadata(metadata as ConversationMetadata)

      // Only choose the dataset if it's not already selected
      const ds = selectedDataset
        ? undefined
        : datasets.find((ds) => ds.id === document.datasetId)

      if (!ds) return

      setSelectedDataset(ds)
      buildHeaders(ds)
    }

    fn()
  }, [document, selectedDataset, setSelectedDataset, buildHeaders, datasets])

  useMappedParametersFromLocalStorage({
    document,
    commitVersionUuid,
    parametersList,
    selectedDataset,
    onDatasetReady: ({ mapped }) => {
      setParameters(mapped)
    },
  })
  return {
    datasets,
    isLoadingDatasets,
    selectedDataset,
    headers,
    wantAllLines,
    fromLine,
    toLine,
    parameters,
    parametersList,
    onParameterChange,
    onSelectDataset,
    setAllRows,
    setFromLine,
    setToLine,
    // TODO: Make this also accept dataset V2
    maxLineCount: selectedDataset?.fileMetadata?.rowCount,
  }
}
