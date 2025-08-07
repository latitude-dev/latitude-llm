'use client'

import { useNavigate } from '$/hooks/useNavigate'
import { ROUTES } from '$/services/routes'
import useApiKeys from '$/stores/apiKeys'
import { Modal } from '@latitude-data/web-ui/atoms/Modal'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Input } from '@latitude-data/web-ui/atoms/Input'
import { use, useCallback, useMemo } from 'react'
import { useFormAction } from '$/hooks/useFormAction'

export default function UpdateApiKeyPage({ params }: { params: Promise<{ apiKeyId: string }> }) {
  const { apiKeyId } = use(params)
  const navigate = useNavigate()

  const { data: apiKeys, update, isUpdating } = useApiKeys()
  const { action } = useFormAction(update, {
    onSuccess: () => {
      navigate.push(ROUTES.settings.root)
    },
  })
  const apiKey = useMemo(() => apiKeys.find((k) => k.id === Number(apiKeyId)), [apiKeys, apiKeyId])

  const onCancel = useCallback(() => {
    navigate.push(ROUTES.settings.root)
  }, [navigate])

  return (
    <Modal
      open
      dismissible
      onOpenChange={(open) => !open && onCancel()}
      title='Update API Key'
      description='Update the name for your API key'
      footer={
        <div className='flex flex-row gap-2'>
          <Button fancy variant='outline' onClick={onCancel} disabled={isUpdating}>
            Cancel
          </Button>
          <Button fancy type='submit' form='update-api-key-form' disabled={isUpdating}>
            {isUpdating ? 'Updating...' : 'Update API Key'}
          </Button>
        </div>
      }
    >
      <form id='update-api-key-form' action={action}>
        <Input type='hidden' name='id' value={apiKeyId} />
        <Input
          autoFocus
          label='Name'
          name='name'
          defaultValue={apiKey?.name ?? ''}
          placeholder='Enter API key name'
        />
      </form>
    </Modal>
  )
}
