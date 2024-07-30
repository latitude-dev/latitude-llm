'use client'

import { useCallback } from 'react'

import { Providers } from '@latitude-data/core/browser'
import {
  Button,
  CloseTrigger,
  FormWrapper,
  Input,
  Modal,
  Select,
} from '@latitude-data/web-ui'
import { useFormAction } from '$/hooks/useFormAction'
import { ROUTES } from '$/services/routes'
import useProviderApiKeys from '$/stores/providerApiKeys'
import { useRouter } from 'next/navigation'

export default function NewApiKeyModal() {
  const router = useRouter()
  const goToSettings = useCallback(
    () => router.push(ROUTES.settings.root),
    [router],
  )
  const { create } = useProviderApiKeys()
  const { data, action } = useFormAction(create, {
    onSuccess: goToSettings,
  })

  // TODO: remove the hidden input when the select component has more than one
  // option and is not disabled anymore
  return (
    <Modal
      defaultOpen
      onOpenChange={goToSettings}
      title='Add new API Key'
      description='API keys allow you to work with a specific LLM model in your prompts and evaluations.'
      footer={
        <>
          <CloseTrigger />
          <Button form='createApiKeyForm' type='submit'>
            Create API Key
          </Button>
        </>
      }
    >
      <form id='createApiKeyForm' action={action}>
        <FormWrapper>
          <Input type='hidden' name='provider' value={Providers.OpenAI} />
          <Select
            aria-disabled
            disabled
            required
            label='Provider'
            name='provider'
            value={Providers.OpenAI}
            options={[{ value: Providers.OpenAI, label: Providers.OpenAI }]}
          />
          <Input
            required
            type='text'
            label='Name'
            name='name'
            defaultValue={data?.name}
            placeholder='My API Key'
          />
          <Input
            required
            label='Token'
            type='text'
            name='token'
            defaultValue={data?.token}
            placeholder='sk-0dfdsn23bm4m23n4MfB'
          />
        </FormWrapper>
      </form>
    </Modal>
  )
}
