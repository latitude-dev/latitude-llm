import { FormEvent, useState } from 'react'

import { useToast } from '@latitude-data/web-ui'
import { generateDatasetAction } from '$/actions/datasets/generateDataset'
import { useNavigate } from '$/hooks/useNavigate'
import { useStreamableAction } from '$/hooks/useStreamableAction'
import { ROUTES } from '$/services/routes'
import useDatasets from '$/stores/datasets'
import { GenerateDatasetModalComponent } from '$/app/(private)/datasets/_components/RootHeader/GenerateDatasetModal/GenerateDatasetModal/GenerateDatasetModalComponent'
import { useDatasetPreviewModal } from '$/app/(private)/datasets/_components/RootHeader/GenerateDatasetModal/GenerateDatasetModal/useDatasetPreviewModal'

export function GenerateDatasetV1Modal({
  open,
  onOpenChange,
  parameters: defaultParameters,
  name: defaultName,
  backUrl,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  parameters: string[]
  name?: string
  backUrl?: string
}) {
  const { toast } = useToast()
  const navigate = useNavigate()
  const { data: datasets, mutate } = useDatasets()
  const [unexpectedError, setUnexpectedError] = useState<Error | undefined>()
  const {
    runAction: runGenerateAction,
    isLoading: generateIsLoading,
    done: generateIsDone,
    error: generateError,
  } = useStreamableAction<typeof generateDatasetAction>(generateDatasetAction)
  const modalData = useDatasetPreviewModal({
    defaultParameters,
    generateErrorMessage: generateError?.message || unexpectedError?.message,
  })

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const formData = new FormData(e.target as HTMLFormElement)

    if (!modalData.previewCsv) {
      modalData.generatePreview(formData)
    } else {
      const response = await runGenerateAction({
        parameters: formData.get('parameters') as string,
        description: formData.get('description') as string,
        rowCount: parseInt(formData.get('rows') as string, 10),
        name: formData.get('name') as string,
      })

      try {
        const dataset = await response
        if (!dataset) return

        mutate([...datasets, dataset])
        toast({
          title: 'Success',
          description: 'Dataset generated succesfully',
        })

        if (backUrl) {
          navigate.push(backUrl)
        } else {
          navigate.push(ROUTES.datasets.detail(dataset.id))
        }
      } catch (error) {
        setUnexpectedError(error as Error)
      }
    }
  }
  return (
    <GenerateDatasetModalComponent
      // Component state
      open={open}
      onOpenChange={onOpenChange}
      backUrl={backUrl}
      defaultName={defaultName}
      // Data
      explanation={modalData.explanation}
      defaultParameters={modalData.defaultParameters}
      parameters={modalData.parameters}
      previewCsv={modalData.previewCsv}
      // State
      handleRegeneratePreview={modalData.handleRegeneratePreview}
      handleParametersChange={modalData.handleParametersChange}
      onSubmit={onSubmit}
      // Actions
      previewIsLoading={modalData.previewIsLoading && !generateIsDone}
      generateIsLoading={generateIsLoading}
      errorMessage={modalData.errorMessage}
    />
  )
}
