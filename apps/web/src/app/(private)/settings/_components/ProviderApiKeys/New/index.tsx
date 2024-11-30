'use client'

import { FormEvent, useCallback, useState } from 'react'

import { Providers } from '@latitude-data/core/browser'
import {
  Button,
  CloseTrigger,
  FormWrapper,
  Input,
  Modal,
  Select,
} from '@latitude-data/web-ui'
import { formDataToAction } from '$/helpers/forms'
import useModelOptions from '$/hooks/useModelOptions'
import { useNavigate } from '$/hooks/useNavigate'
import { ROUTES } from '$/services/routes'
import useProviderApiKeys from '$/stores/providerApiKeys'

const PROVIDER_OPTIONS = Object.entries(Providers).map(([key, value]) => ({
  value,
  label: key,
}))

export default function NewProviderApiKey() {
  const navigate = useNavigate()
  const onOpenChange = useCallback(
    (open: boolean) => !open && navigate.push(ROUTES.settings.root),
    [navigate],
  )
  const { create } = useProviderApiKeys()
  const onSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()

      const payload = formDataToAction<typeof create>(
        new FormData(event.currentTarget),
      )

      const [_, error] = await create({
        ...payload,
        defaultModel: payload.defaultModel || undefined, // Ensure defaultModel is either non-empty or undefined
      })
      if (!error) onOpenChange(false)
    },
    [create],
  )

  const [provider, setProvider] = useState<string | undefined>()

  const isCustom = provider == Providers.Custom
  const MODEL_OPTIONS = useModelOptions({ provider })

  const defaultModelInputInfo = {
    label: 'Default model',
    description:
      'The model selected by default when using this provider in the prompt or evaluation. You can choose another one at any time in the editor.',
  }

  return (
    <Modal
      dismissible
      open
      onOpenChange={onOpenChange}
      title='Create Provider'
      description='Providers allow you to add an API Key and work with a specific LLM model in your prompts or evaluations.'
      footer={
        <>
          <CloseTrigger />
          <Button fancy form='createApiKeyForm' type='submit'>
            Create Provider
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
            label='Provider'
            description="This is the name you'll use in the prompt editor to refer to use this provider and model."
            placeholder='My Provider'
          />
          <Select
            required
            name='provider'
            options={PROVIDER_OPTIONS}
            onChange={(value) => setProvider(value as Providers)}
            label='Source'
          />
          <Input
            required
            type='text'
            name='token'
            label='API Key'
            placeholder='sk-0dfdsn23bm4m23n4MfB'
          />
          {isCustom && (
            <Input
              required
              type='text'
              name='url'
              label='URL'
              description='URL to your OpenAI compatible API.'
              placeholder='http://localhost:11434/v1'
            />
          )}
          {!isCustom && MODEL_OPTIONS.length ? (
            <Select
              name='defaultModel'
              options={MODEL_OPTIONS}
              {...defaultModelInputInfo}
            />
          ) : (
            <Input
              type='text'
              name='defaultModel'
              {...defaultModelInputInfo}
              placeholder='llama3.2-8b'
            />
          )}
        </FormWrapper>
      </form>
    </Modal>
  )
}
