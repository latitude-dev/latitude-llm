import { Text } from '@latitude-data/web-ui/atoms/Text'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { EvaluationModal } from '../EvaluationModal'
import { ProviderApiKey } from '@latitude-data/core/schema/models/types/ProviderApiKey'
import { scan } from 'promptl-ai'
import { useCallback, useState } from 'react'
import useDocumentVersion from '$/stores/useDocumentVersion'
import useProviderApiKeys from '$/stores/providerApiKeys'
import { useCurrentProject } from '$/app/providers/ProjectProvider'

type GenerateEvaluationButtonProps = {
  generateEvaluationFromIssue: (providerName: string, model: string) => void
  issueDocumentUuid: string
  commitUuid: string
}

export function GenerateEvaluationButton({
  generateEvaluationFromIssue,
  issueDocumentUuid,
  commitUuid,
}: GenerateEvaluationButtonProps) {
  const { project } = useCurrentProject()
  const { data: document } = useDocumentVersion({
    projectId: project.id,
    commitUuid,
    documentUuid: issueDocumentUuid,
  })
  const { data: providers } = useProviderApiKeys()

  const [openGenerateModal, setOpenGenerateModal] = useState(false)
  const [provider, setProvider] = useState<ProviderApiKey | undefined>()
  const [model, setModel] = useState<string | undefined | null>()

  const openModalAndGetProviderFromDocument = useCallback(async () => {
    try {
      const metadata = await scan({
        prompt: document?.content ?? '',
      })
      const providerName = metadata.config?.['provider']
      const model = metadata.config?.['model'] as string | undefined
      const foundProvider = providers?.find((p) => p.name === providerName)
      setProvider(foundProvider)
      setModel(model)
    } catch (error) {
      setProvider(undefined)
      setModel(undefined)
    }
    // When first opening the modal, sometimes the doc is not loaded and the default doesnt appear, as we suppose users won't open the modal that quickly, we'll show it right away
    setOpenGenerateModal(true)
  }, [
    document?.content,
    providers,
    setProvider,
    setModel,
    setOpenGenerateModal,
  ])

  return (
    <div className='grid grid-cols-2 gap-x-4 items-center'>
      <Text.H5 color='foregroundMuted'>Evaluation</Text.H5>
      <div>
        <Button
          variant='primaryMuted'
          iconProps={{
            name: 'sparkles',
            color: 'primary',
            placement: 'left',
          }}
          onClick={openModalAndGetProviderFromDocument}
        >
          Generate
        </Button>
        <EvaluationModal
          open={openGenerateModal}
          setOpen={setOpenGenerateModal}
          generateEvaluationFromIssue={() =>
            generateEvaluationFromIssue(provider?.name!, model!)
          }
          setProvider={setProvider}
          setModel={setModel}
          provider={provider}
          model={model}
        />
      </div>
    </div>
  )
}
