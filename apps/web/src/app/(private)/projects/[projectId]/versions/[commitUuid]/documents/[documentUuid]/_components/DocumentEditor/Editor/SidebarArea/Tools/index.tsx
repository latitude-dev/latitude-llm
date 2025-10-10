import { useMemo } from 'react'
import { useCurrentCommit } from '$/app/providers/CommitProvider'
import { useToggleModal } from '$/hooks/useToogleModal'
import { SidebarSection } from '../Section'
import { ConnectToolsModal } from './ConnectToolsModal'
import { useActiveIntegrations } from './hooks/useActiveIntegrations'
import { ActiveIntegration, ActiveIntegrationData } from './ActiveIntegration'
import { IntegrationDto } from '@latitude-data/core/schema/types'
import { integrationOptions } from './hooks/utils'

export function ToolsSidebarSection({
  integrations: serverIntegrations,
}: {
  integrations: IntegrationDto[]
}) {
  const { commit } = useCurrentCommit()
  const isLive = !!commit.mergedAt
  const { open, onOpen, onClose } = useToggleModal()
  const actions = useMemo(
    () => [{ onClick: onOpen, disabled: isLive }],
    [onOpen, isLive],
  )
  const {
    activeIntegrations,
    addIntegrationTool: _aI,
    removeIntegrationTool: _rI,
  } = useActiveIntegrations()
  const integrations = useMemo<ActiveIntegrationData[]>(
    () =>
      serverIntegrations
        .filter(
          (integration) => activeIntegrations[integration.name] !== undefined,
        )
        .map((integration) => {
          const { icon } = integrationOptions(integration)
          const activeData = activeIntegrations[integration.name]
          const tools = activeData ?? []
          return {
            id: integration.id,
            name: integration.name,
            icon,
            tools,
          } satisfies ActiveIntegrationData
        }),
    [serverIntegrations, activeIntegrations],
  )

  console.log('SERVER_INTEGRATIONS:', serverIntegrations)
  console.log('Integrations:', integrations)
  return (
    <>
      <SidebarSection title='Tools' actions={actions}>
        {integrations.map((integration) => (
          <ActiveIntegration key={integration.id} integration={integration} />
        ))}
      </SidebarSection>
      {open ? <ConnectToolsModal onCloseModal={onClose} /> : null}
    </>
  )
}
