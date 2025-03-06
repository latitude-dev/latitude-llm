import { useCallback, useEffect, useMemo, useState } from 'react'
import { readMetadata } from '@latitude-data/compiler'
import {
  Dataset,
  DatasetV2,
  DatasetVersion,
  DocumentVersion,
} from '@latitude-data/core/browser'
import { scan, type ConversationMetadata } from 'promptl-ai'
import { SelectOption } from '@latitude-data/web-ui'
import useDatasetRowsCount from '$/stores/datasetRowsCount'
import { buildEmptyParameters } from '../../../evaluations/[evaluationId]/_components/Actions/CreateBatchEvaluationModal/useRunBatchForm'
import { useMappedParametersFromLocalStorage } from './useMappedParametersFromLocalStorage'
import { RunBatchParameters } from '$/app/(private)/projects/[projectId]/versions/[commitUuid]/documents/[documentUuid]/evaluations/[evaluationId]/_components/Actions/CreateBatchEvaluationModal/useRunBatch'
import {
  buildColumnList,
  getColumnIndex,
  getDatasetCount,
  useVersionedDatasets,
} from '$/hooks/useVersionedDatasets'

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
  const [selectedDataset, setSelectedDataset] = useState<
    Dataset | DatasetV2 | null
  >(null)
  const [headers, setHeaders] = useState<SelectOption<string>[]>([])
  const [wantAllLines, setAllRows] = useState(true)
  const [fromLine, setFromLine] = useState<number>(1)
  const [toLine, setToLine] = useState<number | undefined>(undefined)
  const [parameters, setParameters] = useState(() =>
    buildEmptyParameters(parametersList),
  )
  const onParameterChange = useCallback(
    (param: string) => (header: string) => {
      const columns = buildColumnList(selectedDataset)
      setParameters((prev: RunBatchParameters) => ({
        ...prev,
        [param]: getColumnIndex(columns, header),
      }))
    },
    [selectedDataset],
  )

  const buildHeaders = useCallback(
    (dataset: Dataset | DatasetV2) => {
      setHeaders([
        { value: '-1', label: '-- Leave this parameter empty' },
        ...buildColumnList(dataset).map((value) => ({ value, label: value })),
      ])
    },
    [setHeaders, selectedDataset],
  )

  const {
    data: datasets,
    isLoading: isLoadingDatasets,
    datasetVersion,
  } = useVersionedDatasets({
    onFetched: (ds, dsVersion) => {
      const identifier =
        dsVersion === DatasetVersion.V1 ? 'datasetId' : 'datasetV2Id'
      const selected = ds.find((d) => d.id === document[identifier])
      if (!selected) return

      // DEPRECATED: Legacy datasets
      if ('fileMetadata' in selected) {
        setToLine(selected.fileMetadata.rowCount)
      }
      setSelectedDataset(selected)
      buildHeaders(selected)
    },
  })
  const onSelectDataset = useCallback(
    async (value: number) => {
      const ds = datasets.find((ds) => ds.id === Number(value))
      if (!ds) return

      setSelectedDataset(ds)
      setParameters(buildEmptyParameters(parametersList))
      setFromLine(1)

      // DEPRECATED: Legacy datasets
      if ('fileMetadata' in ds) {
        setToLine(ds.fileMetadata.rowCount)
      }

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

  const { data: datasetRowsCount } = useDatasetRowsCount({
    dataset: selectedDataset,
    onFetched: (count) => {
      setToLine(() => count)
    },
  })
  const maxLineCount = getDatasetCount(selectedDataset, datasetRowsCount)
  return {
    datasets,
    isLoadingDatasets,
    selectedDataset,
    datasetVersion,
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
    maxLineCount,
  }
}
