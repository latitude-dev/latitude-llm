import { useMemo, useState, useCallback } from 'react'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import {
  TwoColumnSelect,
  TwoColumnSelectOption,
} from '@latitude-data/web-ui/molecules/TwoColumnSelect'
import { ActiveIntegrations } from './useActiveIntegrations'
import { ROUTES } from '$/services/routes'
import { IntegrationToolsList } from './IntegrationTools'
import { integrationOptions } from '$/lib/integrationTypeOptions'
import { BlankSlate } from '@latitude-data/web-ui/molecules/BlankSlate'
import { useNavigate } from '$/hooks/useNavigate'
import { IntegrationDto } from '@latitude-data/core/schema/models/types/Integration'
import Image from 'next/image'

export function IntegrationsList({
  disabled,
  integrations,
  activeIntegrations,
  addIntegrationTool,
  removeIntegrationTool,
  isLoading = false,
}: {
  integrations: IntegrationDto[]
  activeIntegrations: ActiveIntegrations
  addIntegrationTool: (integrationName: string, toolName: string) => void
  removeIntegrationTool: (
    integrationName: string,
    toolName: string,
    toolNames: string[],
  ) => void
  disabled?: boolean
  isLoading?: boolean
}) {
  const navigate = useNavigate()
  const [selectedIntegration, setSelectedIntegration] =
    useState<IntegrationDto | null>(null)

  const options = useMemo<TwoColumnSelectOption<number>[]>(
    () =>
      integrations
        .map((integration) => {
          const { label, icon } = integrationOptions(integration)
          return {
            value: integration.id,
            name: integration.name,
            label,
            icon:
              icon.type === 'image' ? (
                <Image
                  src={icon.src}
                  alt={icon.alt}
                  width={16}
                  height={16}
                  className='rounded'
                />
              ) : (
                <Icon name={icon.name} color='foregroundMuted' />
              ),
            isActive: activeIntegrations[integration.name] !== undefined,
          }
        })
        .sort((a, b) => (b.isActive ? 1 : 0) - (a.isActive ? 1 : 0)),
    [integrations, activeIntegrations],
  )
  const onChange = useCallback(
    (value: number) => {
      const integration = integrations.find((i) => i.id === value) ?? null
      setSelectedIntegration(integration)
    },
    [integrations],
  )
  const onAddNew = useCallback(() => {
    navigate.push(ROUTES.settings.integrations.new.root)
  }, [navigate])
  const addNew = useMemo(
    () => ({
      addNewLabel: 'Add new integration',
      onAddNew,
    }),
    [onAddNew],
  )
  return (
    <TwoColumnSelect
      loading={isLoading}
      options={options}
      addNew={addNew}
      onChange={onChange}
    >
      {selectedIntegration ? (
        <IntegrationToolsList
          disabled={disabled}
          integration={selectedIntegration}
          activeTools={activeIntegrations[selectedIntegration.name]}
          addIntegrationTool={addIntegrationTool}
          removeIntegrationTool={removeIntegrationTool}
        />
      ) : (
        <BlankSlate>
          <Text.H6>Select an integration to see available tools</Text.H6>
        </BlankSlate>
      )}
    </TwoColumnSelect>
  )
}
