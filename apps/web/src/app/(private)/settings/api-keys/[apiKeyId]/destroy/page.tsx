'use client'

import { useNavigate } from '$/hooks/useNavigate'
import { ROUTES } from '$/services/routes'
import useApiKeys from '$/stores/apiKeys'
import { ConfirmModal } from '@latitude-data/web-ui/atoms/Modal'
import { use, useCallback, useMemo } from 'react'

export default function DestroyApiKeyPage({ params }: { params: Promise<{ apiKeyId: string }> }) {
  const { apiKeyId } = use(params)
  const navigate = useNavigate()

  const { data: apiKeys, destroy, isDestroying } = useApiKeys()
  const apiKey = useMemo(() => apiKeys.find((k) => k.id === Number(apiKeyId)), [apiKeys, apiKeyId])

  const onDestroy = useCallback(async () => {
    if (!apiKey) return
    const [_, errors] = await destroy({ id: apiKey.id })
    if (errors) return
    navigate.push(ROUTES.settings.root)
  }, [apiKey, destroy, navigate])

  return (
    <ConfirmModal
      open
      dismissible
      title={`Delete ${apiKey?.name || ''} API key`}
      description='This action cannot be undone. The API key will be permanently removed from your workspace.'
      type='destructive'
      onOpenChange={(open) => !open && navigate.push(ROUTES.settings.root)}
      onConfirm={onDestroy}
      onCancel={() => navigate.push(ROUTES.settings.root)}
      confirm={{
        label: isDestroying ? 'Deleting...' : `Delete ${apiKey?.name || ''}`,
        description: `Are you sure you want to delete the API key "${apiKey?.name || ''}"? This action cannot be undone.`,
        disabled: isDestroying || !apiKey,
        isConfirming: isDestroying,
      }}
    />
  )
}
