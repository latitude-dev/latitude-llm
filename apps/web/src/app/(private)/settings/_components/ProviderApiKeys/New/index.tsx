import { useState } from 'react'

import { Providers } from '@latitude-data/core/browser'
import {
  Button,
  CloseTrigger,
  FormField,
  FormWrapper,
  Input,
  Modal,
  Select,
} from '@latitude-data/web-ui'
import { useFormAction } from '$/hooks/useFormAction'
import useProviderApiKeys from '$/stores/providerApiKeys'

const PROVIDER_OPTIONS = Object.entries(Providers).map(([key, value]) => ({
  value,
  label: key,
}))

export default function NewApiKey({
  open,
  setOpen,
}: {
  open: boolean
  setOpen: (open: boolean) => void
}) {
  const { create } = useProviderApiKeys()
  const { data, action } = useFormAction(create, {
    onSuccess: () => setOpen(false),
  })

  const [providerType, setProviderType] = useState(PROVIDER_OPTIONS[0]!.label)

  const isCustom = providerType == 'custom'

  return (
    <Modal
      open={open}
      onOpenChange={setOpen}
      title='Add new Provider'
      description='Providers allow you to work with a specific LLM models in your prompts and evaluations.'
      footer={
        <>
          <CloseTrigger />
          <Button fancy form='createApiKeyForm' type='submit'>
            Create Provider
          </Button>
        </>
      }
    >
      <form id='createApiKeyForm' action={action}>
        <FormWrapper>
          <FormField label='Provider'>
            <Select
              required
              name='provider'
              onChange={(newValue) => setProviderType(newValue)}
              defaultValue={data?.provider}
              options={PROVIDER_OPTIONS}
            />
          </FormField>
          <FormField label='Name'>
            <Input
              required
              type='text'
              name='name'
              defaultValue={data?.name}
              placeholder='My API Key'
            />
          </FormField>
          <FormField label='Token'>
            <Input
              required
              type='text'
              name='token'
              defaultValue={data?.token}
              placeholder='sk-0dfdsn23bm4m23n4MfB'
            />
          </FormField>
          {isCustom && (
            <FormField label='URL' info='URL to an OpenAI compatible API'>
              <Input
                required
                type='text'
                name='url'
                defaultValue={data?.url}
                placeholder='http://localhost:11434/v1'
              />
            </FormField>
          )}
        </FormWrapper>
      </form>
    </Modal>
  )
}
