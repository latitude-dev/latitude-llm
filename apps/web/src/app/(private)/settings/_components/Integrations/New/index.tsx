'use client'

import { FormEvent, useCallback, useState } from 'react'

import {
  Button,
  CloseTrigger,
  FormWrapper,
  Icon,
  IconName,
  Input,
  Modal,
  Select,
} from '@latitude-data/web-ui'
import { useNavigate } from '$/hooks/useNavigate'
import { ROUTES } from '$/services/routes'
import useIntegrations from '$/stores/integrations'
import { IntegrationConfigurationForm } from '$/app/(private)/settings/_components/Integrations/New/_components/Configuration'
import { IntegrationType } from '@latitude-data/constants'
import { buildIntegrationPayload } from './buildIntegrationPayload'

type IntegrationTypeOption = {
  label: string
  icon: IconName
}

const INTEGRATION_TYPE_VALUES: Record<IntegrationType, IntegrationTypeOption> =
  {
    [IntegrationType.CustomMCP]: {
      label: 'Custom MCP Server',
      icon: 'mcp',
    },
  }

const INTEGRATION_TYPE_OPTIONS = Object.values(IntegrationType).map(
  (value) => ({
    value,
    label: INTEGRATION_TYPE_VALUES[value].label,
    icon: <Icon name={INTEGRATION_TYPE_VALUES[value].icon} />,
  }),
)

export default function NewIntegration() {
  const navigate = useNavigate()
  const onOpenChange = useCallback(
    (open: boolean) => !open && navigate.push(ROUTES.settings.root),
    [navigate],
  )
  const { create } = useIntegrations()
  const onSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()

      const payload = buildIntegrationPayload({
        formData: new FormData(event.currentTarget),
      })
      const [_, error] = await create({
        ...payload,
      })

      if (!error) onOpenChange(false)
    },
    [create],
  )

  const [integrationType, setIntegrationType] = useState<
    IntegrationType | undefined
  >()

  return (
    <Modal
      dismissible
      open
      onOpenChange={onOpenChange}
      title='Create Integration'
      description='Integrations allow you to add soure of tools to your prompts.'
      footer={
        <>
          <CloseTrigger />
          <Button fancy form='createIntegrationForm' type='submit'>
            Create Integration
          </Button>
        </>
      }
    >
      <form id='createIntegrationForm' onSubmit={onSubmit}>
        <FormWrapper>
          <Input
            required
            type='text'
            name='name'
            label='Name'
            description="This is the name you'll use in the prompt editor to refer to use this integration and model."
            placeholder='My Integration'
          />
          <Select
            required
            name='type'
            options={INTEGRATION_TYPE_OPTIONS}
            onChange={(value) => setIntegrationType(value as IntegrationType)}
            label='Type'
          />

          {integrationType ? (
            <IntegrationConfigurationForm integrationType={integrationType} />
          ) : null}
        </FormWrapper>
      </form>
    </Modal>
  )
}
