'use client'

import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import useApiKeys from '$/stores/apiKeys'
import { useRouter, useParams } from 'next/navigation'
import { ROUTES } from '$/services/routes'
import { useEffect, useState } from 'react'
import type { ApiKey } from '@latitude-data/core/browser'

export default function DestroyApiKeyPage() {
  const router = useRouter()
  const params = useParams()
  const { destroy, data: apiKeys } = useApiKeys()
  const [apiKey, setApiKey] = useState<ApiKey | null>(null)

  const apiKeyId = Number(params.apiKeyId)

  useEffect(() => {
    const keyToDestroy = apiKeys.find((k) => k.id === apiKeyId)
    if (keyToDestroy) {
      setApiKey(keyToDestroy)
    } else if (!apiKeys.length) {
      // Initial load or keys not yet available
      return
    } else {
      // Key not found, redirect to settings
      router.push(ROUTES.settings.root)
    }
  }, [apiKeyId, apiKeys, router])

  const handleDelete = async () => {
    if (apiKey) {
      await destroy({ id: apiKey.id })
      router.push(ROUTES.settings.root) // Redirect to settings page after deletion
    }
  }

  if (!apiKey) {
    // TODO: Add a loading state
    return <p>Loading...</p>
  }

  return (
    <div className='container mx-auto py-8'>
      <Text.H2>Delete API Key</Text.H2>
      <Text.P className='mt-4'>
        Are you sure you want to delete the API key named "{apiKey.name}"? This
        action cannot be undone.
      </Text.P>
      <div className='mt-6 flex gap-2'>
        <Button variant='destructive' onClick={handleDelete}>
          Delete API Key
        </Button>
        <Button
          variant='outline'
          onClick={() => router.push(ROUTES.settings.root)}
        >
          Cancel
        </Button>
      </div>
    </div>
  )
}
