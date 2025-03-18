import { useCallback, useEffect, useMemo, useState } from 'react'

import {
  buildCsvFile,
  CsvData,
  DocumentVersion,
} from '@latitude-data/core/browser'
import {
  Alert,
  Button,
  Modal,
  useCurrentProject,
  useToast,
} from '@latitude-data/web-ui'
import { saveDocumentLogsAsDataset } from '$/actions/documentLogs/saveAsDataset'
import { useCurrentDocument } from '$/app/providers/DocumentProvider'
import useFetcher from '$/hooks/useFetcher'
import useLatitudeAction from '$/hooks/useLatitudeAction'
import { ROUTES } from '$/services/routes'
import useDatasets from '$/stores/datasets'
import Link from 'next/link'
import useSWR from 'swr'

import { ExportLogsContent } from './Content'
import { ExportLogsModalFooter } from './Footer'
import { useFeatureFlag } from '$/components/Providers/FeatureFlags'

function generateDatasetName(document: DocumentVersion) {
  const date = new Date().toISOString().split('T')[0]
  const documentName = document.path.split('/').pop()
  return `${documentName} ${date}`
}

export function ExportLogsModal({
  selectedLogsIds,
  close,
}: {
  selectedLogsIds: number[]
  close: () => void
}) {
  const { enabled: canNotModifyDatasets } = useFeatureFlag({
    featureFlag: 'datasetsV1ModificationBlocked',
  })
  const toast = useToast()
  const { project } = useCurrentProject()
  const { document: currentDocument } = useCurrentDocument()

  const { data: datasets, mutate, isLoading: isDatasetsLoading } = useDatasets()

  const fetcher = useFetcher(
    selectedLogsIds.length
      ? ROUTES.api.documentLogs.generateCsv.detail({
          documentLogIds: selectedLogsIds,
        }).root
      : undefined,
    {
      fallback: undefined,
    },
  )

  const { data: csvData, isLoading: isCsvDataLoading } = useSWR<CsvData>(
    ['documentLogCsv', selectedLogsIds],
    fetcher,
  )

  const [datasetName, setDatasetName] = useState<string>('')

  const datasetAlreadyExists = useMemo(() => {
    return datasets?.some((dataset) => dataset.name === datasetName)
  }, [datasets, datasetName])

  const { execute: executeSaveAsDatasetAction, isPending: isSavingAsDataset } =
    useLatitudeAction(saveDocumentLogsAsDataset, {
      onSuccess: ({ data }) => {
        mutate((prev) => [...(prev ?? []), data.dataset])

        toast.toast({
          title: 'Dataset saved successfully',
          description: `Dataset '${datasetName}' has been saved`,
          action: (
            <Link href={ROUTES.datasets.detail(data.dataset.id)}>
              <Button variant='outline'>View</Button>
            </Link>
          ),
        })
        close()
      },
    })

  const downloadCsvData = useCallback(() => {
    if (!csvData) return

    const file = buildCsvFile(csvData, datasetName)
    const url = URL.createObjectURL(file)
    const a = document.createElement('a')
    a.href = url
    a.download = file.name
    a.click()
    URL.revokeObjectURL(url)
  }, [csvData, datasetName])

  const saveAsDataset = useCallback(() => {
    if (
      !selectedLogsIds.length ||
      !datasetName.length ||
      datasetAlreadyExists
    ) {
      return
    }
    executeSaveAsDatasetAction({
      projectId: project.id,
      name: datasetName,
      documentLogIds: selectedLogsIds,
    })
  }, [
    executeSaveAsDatasetAction,
    datasetName,
    selectedLogsIds,
    datasetAlreadyExists,
  ])

  useEffect(() => {
    setDatasetName(generateDatasetName(currentDocument))
  }, [selectedLogsIds])

  return (
    <Modal
      title='Export Logs parameters'
      description='Export the parameters used for each log'
      size='large'
      open={!!selectedLogsIds.length}
      dismissible
      onOpenChange={(open) => !open && close()}
      footer={
        <ExportLogsModalFooter
          disabled={canNotModifyDatasets}
          datasetName={datasetName}
          setDatasetName={setDatasetName}
          datasetAlreadyExists={datasetAlreadyExists}
          downloadAsCsvDisabled={
            isDatasetsLoading || isCsvDataLoading || !csvData
          }
          downloadAsCsv={downloadCsvData}
          saveAsDatasetDisabled={
            !selectedLogsIds.length ||
            !datasetName.length ||
            datasetAlreadyExists ||
            isSavingAsDataset
          }
          isSavingAsDataset={isSavingAsDataset}
          saveAsDataset={saveAsDataset}
        />
      }
    >
      {canNotModifyDatasets ? (
        <div className='mb-4'>
          <Alert
            variant='default'
            title='Dataset creation is disabled'
            description="We're running some maintenance on datasets. At the moment is not possible to create or delete datasets. Please try again later."
          />
        </div>
      ) : null}
      <ExportLogsContent
        disabled={canNotModifyDatasets}
        selectedRowCount={selectedLogsIds.length}
        csvData={csvData}
        datasetAlreadyExists={datasetAlreadyExists}
        datasetName={datasetName}
        setDatasetName={setDatasetName}
      />
    </Modal>
  )
}
