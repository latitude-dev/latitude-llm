'use client'
import { useCallback, useMemo, useRef, useState, FormEvent } from 'react'

import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Input } from '@latitude-data/web-ui/atoms/Input'
import { Modal } from '@latitude-data/web-ui/atoms/Modal'
import { CloseTrigger } from '@latitude-data/web-ui/atoms/Modal'
import { useNavigate } from '$/hooks/useNavigate'
import { ROUTES } from '$/services/routes'
import useIntegrations from '$/stores/integrations'
import { IntegrationType } from '@latitude-data/constants'
import { useToast } from '@latitude-data/web-ui/atoms/Toast'
import { TabSelect } from '@latitude-data/web-ui/molecules/TabSelect'
import {
  ActiveIntegrationConfiguration,
  UnconfiguredPipedreamIntegrationConfiguration,
} from '@latitude-data/core/services/integrations/helpers/schema'
import { PipedreamIntegrationConfiguration } from './_components/Configuration/Pipedream'
import { ExternalIntegrationConfiguration } from './_components/Configuration/External'
import { Alert } from '@latitude-data/web-ui/atoms/Alert'

export type ValidIntegration = Exclude<
  ActiveIntegrationConfiguration,
  | { type: IntegrationType.Latitude }
  | {
      type: IntegrationType.Pipedream
      configuration: UnconfiguredPipedreamIntegrationConfiguration
    }
>

export default function NewIntegration() {
  const { toast } = useToast()
  const navigate = useNavigate()
  const onOpenChange = useCallback(
    (open: boolean) => !open && navigate.push(ROUTES.settings.root),
    [navigate],
  )
  const { create } = useIntegrations()

  const [isCreating, setIsCreating] = useState<boolean>(false)

  const [integrationName, setIntegrationName] = useState<string>('')
  const nameErrors = useMemo<string[] | undefined>(() => {
    const errors = []
    if (integrationName.includes(' ')) {
      errors.push('Name cannot contain spaces')
    }
    if (integrationName.includes('/')) {
      errors.push('Name cannot contain slashes')
    }
    return errors.length ? errors : undefined
  }, [integrationName])

  const [integrationType, setIntegrationType] = useState<IntegrationType>(
    IntegrationType.Pipedream,
  )

  const [error, setError] = useState<Error | undefined>(undefined)

  const configRef = useRef<{
    validate: () => Promise<ValidIntegration>
  }>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setIsCreating(true)
    setError(undefined)
    let integration: ValidIntegration

    try {
      integration = await configRef.current!.validate()
    } catch (err) {
      setIsCreating(false)
      setError(err as Error)
      return
    }

    const [_, createError] = await create({
      ...integration,
      name: integrationName,
    })
    setIsCreating(false)

    if (createError) {
      toast({
        title: 'Error creating integration',
        description: createError.message,
        variant: 'destructive',
      })
      return
    }

    onOpenChange(false)
  }

  return (
    <Modal
      dismissible
      open
      onOpenChange={onOpenChange}
      title='Create Integration'
      description='Integrations allow your prompt to interact with external services.'
      footer={
        <>
          <CloseTrigger />
          <Button
            fancy
            form='createIntegrationForm'
            type='submit'
            isLoading={isCreating}
            iconProps={{
              name: 'unplug',
            }}
          >
            Connect & Create
          </Button>
        </>
      }
    >
      <form
        id='createIntegrationForm'
        onSubmit={handleSubmit}
        className='flex flex-col gap-4'
      >
        <Input
          required
          type='text'
          name='name'
          label='Name'
          disabled={isCreating}
          description="This is the name you'll use in the prompt editor to refer to use this integration and model."
          placeholder='my_integration'
          onChange={(event) => setIntegrationName(event.target.value)}
          value={integrationName}
          errors={nameErrors}
        />

        <TabSelect
          value={integrationType}
          disabled={isCreating}
          options={[
            {
              value: IntegrationType.Pipedream,
              label: 'Connect to an App',
            },
            {
              value: IntegrationType.ExternalMCP,
              label: 'Custom MCP server',
            },
          ]}
          onChange={(value) => {
            setIntegrationType(value)
          }}
        />

        {integrationType === IntegrationType.Pipedream ? (
          <PipedreamIntegrationConfiguration ref={configRef} />
        ) : (
          <ExternalIntegrationConfiguration ref={configRef} />
        )}

        {error && (
          <Alert
            variant='destructive'
            title={error.name}
            description={error.message}
          />
        )}
      </form>
    </Modal>
  )
}
