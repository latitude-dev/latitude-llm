import { FormEvent } from 'react'

import { useToast } from '@latitude-data/web-ui/atoms/Toast'
import { useNavigate } from '$/hooks/useNavigate'
import { ROUTES } from '$/services/routes'
import useDatasets from '$/stores/datasets'
import { GenerateDatasetModalComponent } from './GenerateDatasetModalComponent'
import { useDatasetPreviewModal } from './useDatasetPreviewModal'

export function GenerateDatasetModal({
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
  const navigate = useNavigate()
  const { toast } = useToast()
  const {
    data: datasets,
    mutate,
    runGenerateAction,
    generateIsLoading,
    generateError,
  } = useDatasets()

  const modalData = useDatasetPreviewModal({
    defaultParameters,
    generateErrorMessage: generateError?.message,
  })

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const formData = new FormData(e.target as HTMLFormElement)

    if (!modalData.previewData) {
      modalData.generatePreview(formData)
    } else {
      const [dataset] = await runGenerateAction({
        parameters: formData.get('parameters') as string,
        description: formData.get('description') as string,
        rowCount: parseInt(formData.get('rows') as string, 10),
        name: formData.get('name') as string,
      })

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
      previewData={modalData.previewData}
      // State
      handleRegeneratePreview={modalData.handleRegeneratePreview}
      handleParametersChange={modalData.handleParametersChange}
      onSubmit={onSubmit}
      // Actions
      previewIsLoading={modalData.previewIsLoading}
      generateIsLoading={generateIsLoading}
      errorMessage={modalData.errorMessage}
    />
  )
}
