import { ProviderModelSelector } from '$/components/ProviderModelSelector'
import { ConfirmModal } from '@latitude-data/web-ui/atoms/Modal'
import useProviderApiKeys from '$/stores/providerApiKeys'
import { ProviderApiKey } from '@latitude-data/core/schema/models/types/ProviderApiKey'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { useEffect } from 'react'
import { scan } from 'promptl-ai'
import useDocumentVersion from '$/stores/useDocumentVersion'
import { Issue } from '@latitude-data/core/schema/models/types/Issue'

export function EvaluationModal({
  open,
  setOpen,
  generateEvaluationFromIssue,
  setProvider,
  setModel,
  provider,
  model,
  issue,
}: {
  open: boolean
  setOpen: (open: boolean) => void
  generateEvaluationFromIssue: () => void
  setProvider: (provider: ProviderApiKey | undefined) => void
  setModel: (model: string | undefined | null) => void
  provider: ProviderApiKey | undefined
  model: string | undefined | null
  issue: Issue
}) {
  const { data: document } = useDocumentVersion(issue.documentUuid)
  const { data: providers } = useProviderApiKeys()

  useEffect(() => {
    if (!document?.content || !providers) return

    const parseMetadata = async () => {
      try {
        const metadata = await scan({
          prompt: document.content,
        })
        const providerName = metadata.config?.['provider']
        const model = metadata.config?.['model'] as string | undefined
        const foundProvider = providers.find((p) => p.name === providerName)
        setProvider(foundProvider)
        setModel(model)
      } catch (error) {
        setProvider(undefined)
        setModel(undefined)
      }
    }

    parseMetadata()
  }, [document?.content, open, providers, setProvider, setModel])

  return (
    <ConfirmModal
      dismissible
      open={open}
      onOpenChange={setOpen}
      title='Select LLM provider'
      description='Before generating evaluation for the selected issue, select an LLM provider from the list below'
      onConfirm={() => {
        generateEvaluationFromIssue()
        setOpen(false)
      }}
      confirm={{
        label: 'Generate',
        disabled: !provider || !model,
        isConfirming: false,
      }}
    >
      <div className='flex flex-col gap-2'>
        <Text.H5M>Provider</Text.H5M>
        <ProviderModelSelector
          defaultProvider={provider}
          defaultModel={model}
          fancyButton
          alignPopover='end'
          prompt={''}
          onChangePrompt={() => {}}
          providers={providers}
          setProvider={setProvider}
          setModel={setModel}
        />
      </div>
    </ConfirmModal>
  )
}
