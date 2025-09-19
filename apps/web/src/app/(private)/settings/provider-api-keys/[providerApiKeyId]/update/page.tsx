'use client'

import { useFormAction } from '$/hooks/useFormAction'
import { useNavigate } from '$/hooks/useNavigate'
import useProviderApiKeys from '$/stores/providerApiKeys'
import { ROUTES } from '$/services/routes'
import { Input } from '@latitude-data/web-ui/atoms/Input'
import { Modal } from '@latitude-data/web-ui/atoms/Modal'
import { use, useMemo, useCallback } from 'react'
import { Button } from '@latitude-data/web-ui/atoms/Button'

export default function UpdateProviderApiKeyPage({
  params,
}: {
  params: Promise<{ providerApiKeyId: string }>
}) {
  const { providerApiKeyId } = use(params)
  const navigate = useNavigate()

  const { data: apiKeys, update, isUpdating } = useProviderApiKeys()
  const { action } = useFormAction(update, {
    onSuccess: () => {
      navigate.push(ROUTES.settings.root)
    },
  })
  const apiKey = useMemo(
    () => apiKeys.find((k) => k.id === Number(providerApiKeyId)),
    [apiKeys, providerApiKeyId],
  )

  const onCancel = useCallback(() => {
    navigate.push(ROUTES.settings.root)
  }, [navigate])

  return (
    <Modal
      open
      dismissible
      onOpenChange={(open) => !open && onCancel()}
      title='Update provider API key'
      description='Update the name for your provider API key'
      footer={
        <div className='flex flex-row gap-2'>
          <Button
            fancy
            variant='outline'
            onClick={onCancel}
            disabled={isUpdating}
          >
            Cancel
          </Button>
          <Button
            fancy
            type='submit'
            form='update-api-key-form'
            disabled={isUpdating}
          >
            {isUpdating ? 'Updating...' : 'Update'}
          </Button>
        </div>
      }
    >
      <form id='update-api-key-form' action={action}>
        <Input type='hidden' name='id' value={providerApiKeyId} />
        <Input
          autoFocus
          label='Name'
          name='name'
          defaultValue={apiKey?.name ?? ''}
          placeholder='Enter new provider API key name'
        />
      </form>
    </Modal>
  )
}
