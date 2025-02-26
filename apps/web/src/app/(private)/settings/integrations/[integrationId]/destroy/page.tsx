'use client'

import { use } from 'react'

import DestroyModal from '$/components/modals/DestroyModal'
import { useNavigate } from '$/hooks/useNavigate'
import { ROUTES } from '$/services/routes'
import useIntegrations from '$/stores/integrations'

export default function DestroyIntegration({
  params,
}: {
  params: Promise<{ integrationId: string }>
}) {
  const { integrationId } = use(params)
  const navigate = useNavigate()
  const { data, destroy } = useIntegrations()
  const integration = data.find((p) => p.id === Number(integrationId))

  if (!integration) return null

  return (
    <DestroyModal
      onOpenChange={(open) => !open && navigate.push(ROUTES.settings.root)}
      title='Remove Integration'
      description={`Are you sure you want to remove ${integration?.name} from this workspace? Any prompts or evaluations using this integration will be affected.`}
      action={() => destroy({ id: integration.id })}
      submitStr={`Remove ${integration?.name}`}
      model={integration}
      onSuccess={() => navigate.push(ROUTES.settings.root)}
    />
  )
}
