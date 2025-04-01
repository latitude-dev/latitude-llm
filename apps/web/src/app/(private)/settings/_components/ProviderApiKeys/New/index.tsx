'use client'
import { FormEvent, useCallback, useState } from 'react'

import { Providers } from '@latitude-data/core/browser'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { FormWrapper } from '@latitude-data/web-ui/atoms/FormWrapper'
import { Input } from '@latitude-data/web-ui/atoms/Input'
import { Modal } from '@latitude-data/web-ui/atoms/Modal'
import { Select } from '@latitude-data/web-ui/atoms/Select'
import { CloseTrigger } from '@latitude-data/web-ui/atoms/Modal'
import useModelOptions from '$/hooks/useModelOptions'
import { useNavigate } from '$/hooks/useNavigate'
import { ROUTES } from '$/services/routes'
import useProviderApiKeys from '$/stores/providerApiKeys'
import { ProviderConfigurationForm } from '$/app/(private)/settings/_components/ProviderApiKeys/New/_components/Configuration'
import { buildProviderPayload } from './buildProviderPayload'

const CUSTOM_LABELS: Partial<Record<Providers, string>> = {
  [Providers.GoogleVertex]: 'Google Vertex (Gemini models)',
  [Providers.AnthropicVertex]: 'Google Vertex (Anthropic models)',
}

const PROVIDER_OPTIONS = Object.entries(Providers).map(([key, value]) => ({
  value,
  label: CUSTOM_LABELS[value] ?? key,
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

      const payload = buildProviderPayload({
        formData: new FormData(event.currentTarget),
      })
      const [_, error] = await create({
        ...payload,
        defaultModel: payload.defaultModel || undefined,
      })

      if (!error) onOpenChange(false)
    },
    [create],
  )

  const [provider, setProvider] = useState<Providers | undefined>()

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
            label='Name'
            description="This is the name you'll use in the prompt editor to refer to use this provider and model."
            placeholder='My Provider'
          />
          <Select
            required
            name='provider'
            options={PROVIDER_OPTIONS}
            onChange={(value) => setProvider(value as Providers)}
            label='Provider'
          />

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

          {provider ? <ProviderConfigurationForm provider={provider} /> : null}
        </FormWrapper>
      </form>
    </Modal>
  )
}
