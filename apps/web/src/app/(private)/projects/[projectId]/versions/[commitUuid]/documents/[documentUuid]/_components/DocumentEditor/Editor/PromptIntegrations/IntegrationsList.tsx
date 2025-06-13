import { useMemo, useState, useCallback } from 'react'
import { IntegrationDto } from '@latitude-data/core/browser'
import {
  TwoColumnSelect,
  TwoColumnSelectOption,
} from '@latitude-data/web-ui/molecules/TwoColumnSelect'
import { ActiveIntegrations } from './useActiveIntegrations'
import { ROUTES } from '$/services/routes'
import { IntegrationToolsList } from './IntegrationTools'
import { integrationOptions } from '$/lib/integrationTypeOptions'
import { useNavigate } from '$/hooks/useNavigate'

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
      integrations.map((integration) => ({
        value: integration.id,
        name: integration.name,
        isActive: activeIntegrations[integration.name] !== undefined,
        ...integrationOptions(integration),
      })),
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
      {selectedIntegration && (
        <IntegrationToolsList
          disabled={disabled}
          integration={selectedIntegration}
          activeTools={activeIntegrations[selectedIntegration.name]}
          addIntegrationTool={addIntegrationTool}
          removeIntegrationTool={removeIntegrationTool}
        />
      )}
    </TwoColumnSelect>
  )
}
