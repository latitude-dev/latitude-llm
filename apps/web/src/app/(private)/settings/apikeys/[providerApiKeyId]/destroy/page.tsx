'use client'

import { Usable, use } from 'react'

import DestroyModal from '$/components/modals/DestroyModal'
import { useNavigate } from '$/hooks/useNavigate'
import { ROUTES } from '$/services/routes'
import useProviderApiKeys from '$/stores/providerApiKeys'

export default function DestroyProviderApiKey({
  params,
}: {
  params: Usable<{ providerApiKeyId: string }>
}) {
  const { providerApiKeyId } = use(params)
  const navigate = useNavigate()
  const { data, destroy } = useProviderApiKeys()
  const apiKey = data.find((p) => p.id === Number(providerApiKeyId))

  if (!apiKey) return null

  return (
    <DestroyModal
      onOpenChange={(open) => !open && navigate.push(ROUTES.settings.root)}
      title='Remove API Key'
      description={`Are you sure you want to remove ${apiKey?.name} from this workspace? Any prompts or evaluations using this key will be affected.`}
      action={destroy}
      submitStr={`Remove ${apiKey?.name}`}
      model={apiKey}
      onSuccess={() => navigate.push(ROUTES.settings.root)}
    />
  )
}
