import { ProviderModelSelector } from '$/components/ProviderModelSelector'
import { ConfirmModal } from '@latitude-data/web-ui/atoms/Modal'
import useProviderApiKeys from '$/stores/providerApiKeys'
import { ProviderApiKey } from '@latitude-data/core/schema/models/types/ProviderApiKey'
import { Text } from '@latitude-data/web-ui/atoms/Text'

export function EvaluationModal({
  open,
  setOpen,
  generateEvaluationFromIssue,
  setProvider,
  setModel,
  provider,
  model,
}: {
  open: boolean
  setOpen: (open: boolean) => void
  generateEvaluationFromIssue: () => void
  setProvider: (provider: ProviderApiKey | undefined) => void
  setModel: (model: string | undefined | null) => void
  provider: ProviderApiKey | undefined
  model: string | undefined | null
}) {
  const { data: providers } = useProviderApiKeys()

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
