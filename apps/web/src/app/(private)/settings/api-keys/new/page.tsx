'use client'

import { FormEvent, useCallback } from 'react'

import { useNavigate } from '$/hooks/useNavigate'
import { ROUTES } from '$/services/routes'
import useApiKeys from '$/stores/apiKeys'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { FormWrapper } from '@latitude-data/web-ui/atoms/FormWrapper'
import { Input } from '@latitude-data/web-ui/atoms/Input'
import { CloseTrigger, Modal } from '@latitude-data/web-ui/atoms/Modal'

export default function NewApiKeyPage() {
  const navigate = useNavigate()
  const onOpenChange = useCallback(
    (open: boolean) => !open && navigate.push(ROUTES.settings.root),
    [navigate],
  )
  const { create } = useApiKeys()
  const onSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()

      const formData = new FormData(event.currentTarget)
      const name = formData.get('name') as string

      await create({ name })
      onOpenChange(false)
    },
    [create, onOpenChange],
  )

  return (
    <Modal
      dismissible
      open
      onOpenChange={onOpenChange}
      title='Create API Key'
      description='Create a new API key for your workspace to access the Latitude API.'
      footer={
        <>
          <CloseTrigger />
          <Button fancy form='createApiKeyForm' type='submit'>
            Create API Key
          </Button>
        </>
      }
    >
      <form id='createApiKeyForm' onSubmit={onSubmit}>
        <FormWrapper>
          <Input
            required
            type='text'
            name='name'
            label='API Key Name'
            description='Choose a descriptive name for your API key to help you identify it later.'
            placeholder='My API Key'
          />
        </FormWrapper>
      </form>
    </Modal>
  )
}
