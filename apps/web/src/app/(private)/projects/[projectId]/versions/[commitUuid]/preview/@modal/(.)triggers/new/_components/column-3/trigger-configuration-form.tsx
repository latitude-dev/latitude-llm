'use client'

import type React from 'react'
import { useCallback, useMemo, useState } from 'react'
import type { ConfigurableProps, ConfiguredProps } from '@pipedream/sdk/browser'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { FormWrapper } from '@latitude-data/web-ui/atoms/FormWrapper'
import { Select } from '@latitude-data/web-ui/atoms/Select'
import { useCurrentCommit, useCurrentProject } from '@latitude-data/web-ui/providers'
import useDocumentVersions from '$/stores/documentVersions'
import useDocumentTriggers from '$/stores/documentTriggers'
import { DocumentTriggerType, DocumentType } from '@latitude-data/constants'
import type {
  IntegrationDto,
  PipedreamComponent,
  PipedreamComponentType,
} from '@latitude-data/core/browser'
import { IntegrationTriggerConfig } from '../../../../../../documents/[documentUuid]/_components/DocumentTabs/DocumentTriggers/Modal/IntegrationTriggerConfig'
import { useNavigate } from '$/hooks/useNavigate'
import { ROUTES } from '$/services/routes'

interface TriggerConfigurationFormProps {
  integration: IntegrationDto
  triggerComponent: PipedreamComponent<PipedreamComponentType.Trigger>
}

export function TriggerConfigurationForm({
  integration,
  triggerComponent,
}: TriggerConfigurationFormProps) {
  const [configuredProps, setConfiguredProps] = useState<ConfiguredProps<ConfigurableProps>>({})
  const [payloadParameters, setPayloadParameters] = useState<string[]>([])
  const [selectedDocumentUuid, setSelectedDocumentUuid] = useState<string>('')
  const navigate = useNavigate()
  const { project } = useCurrentProject()
  const { commit } = useCurrentCommit()
  const { create, isCreating } = useDocumentTriggers({ projectId: project.id })
  const { data: documents } = useDocumentVersions({ projectId: project.id })
  const document = useMemo(
    () => documents.find((d) => d.documentUuid === selectedDocumentUuid),
    [documents, selectedDocumentUuid],
  )

  const handleSubmit = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault()

      const [_, error] = await create({
        documentUuid: selectedDocumentUuid,
        trigger: {
          type: DocumentTriggerType.Integration,
          configuration: {
            integrationId: integration.id,
            componentId: triggerComponent.key,
            properties: configuredProps,
            payloadParameters,
          },
        },
      })

      if (error) return

      navigate.push(
        ROUTES.projects.detail({ id: project.id }).commits.detail({ uuid: commit.uuid }).preview
          .root,
      )
    },
    [
      integration,
      triggerComponent,
      configuredProps,
      payloadParameters,
      create,
      selectedDocumentUuid,
      navigate,
      project,
      commit,
    ],
  )

  return (
    <form onSubmit={handleSubmit}>
      <FormWrapper>
        <AgentSelect
          selectedDocumentUuid={selectedDocumentUuid}
          setSelectedDocumentUuid={setSelectedDocumentUuid}
        />
        {document && (
          <IntegrationTriggerConfig
            document={document}
            integration={integration}
            component={triggerComponent}
            configuredProps={configuredProps}
            setConfiguredProps={setConfiguredProps}
            payloadParameters={payloadParameters}
            setPayloadParameters={setPayloadParameters}
            disabled={isCreating}
          />
        )}
        <Button fullWidth fancy type='submit' disabled={isCreating || !selectedDocumentUuid}>
          Create trigger
        </Button>
      </FormWrapper>
    </form>
  )
}

function AgentSelect({
  selectedDocumentUuid,
  setSelectedDocumentUuid,
}: {
  selectedDocumentUuid: string
  setSelectedDocumentUuid: (documentUuid: string) => void
}) {
  const { project } = useCurrentProject()
  const { data: documents } = useDocumentVersions({
    projectId: project.id,
  })

  return (
    <Select
      required
      label='Agent'
      description='Select the agent that should be triggered'
      name='agent'
      placeholder='Select an agent'
      options={useMemo(
        () =>
          documents
            .filter((d) => d.documentType === DocumentType.Agent)
            .map((d) => ({
              label: d.path,
              value: d.documentUuid,
            })),
        [documents],
      )}
      value={selectedDocumentUuid}
      onChange={setSelectedDocumentUuid}
    />
  )
}
