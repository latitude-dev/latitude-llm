'use client'

import { use } from 'react'

import DestroyModal from '$/components/modals/DestroyModal'
import { useNavigate } from '$/hooks/useNavigate'
import { ROUTES } from '$/services/routes'
import useWebhooks from '$/stores/webhooks'

export default function DestroyWebhook({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const navigate = useNavigate()
  const { data, destroy, isDestroying } = useWebhooks()
  const webhook = data.find((w) => w.id === Number(id))

  if (!webhook) return null

  return (
    <DestroyModal
      onOpenChange={(open) => !open && navigate.push(ROUTES.settings.root)}
      isDestroying={isDestroying}
      title='Remove Webhook'
      description={`Are you sure you want to remove ${webhook?.name} from this workspace? Any notifications using this webhook will be affected.`}
      action={() => destroy({ id: webhook.id })}
      submitStr={`Remove ${webhook?.name}`}
      model={webhook}
      onSuccess={() => navigate.push(ROUTES.settings.root)}
    />
  )
}
