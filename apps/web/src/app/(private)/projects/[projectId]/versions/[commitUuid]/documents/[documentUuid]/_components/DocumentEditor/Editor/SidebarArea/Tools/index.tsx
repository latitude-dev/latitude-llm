import { useMemo } from 'react'
import { useCurrentCommit } from '$/app/providers/CommitProvider'
import { useToggleModal } from '$/hooks/useToogleModal'
import { SidebarSection } from '../Section'
import { ConnectToolsModal } from './ConnectToolsModal'
import { useActiveIntegrations } from './hooks/useActiveIntegrations'
import { ActiveIntegration } from './ActiveIntegration'
import { ToolsProvider } from './ToolsProvider'
import { useActiveIntegrationsStore } from './hooks/useActiveIntegrationsStore'

export function ToolsSidebarSection() {
  const { commit } = useCurrentCommit()
  const isLive = !!commit.mergedAt
  const { open, onOpen, onClose } = useToggleModal()
  const actions = useMemo(
    () => [{ onClick: onOpen, disabled: isLive }],
    [onOpen, isLive],
  )
  const {
    addNewIntegration,
    addIntegrationTool,
    removeIntegrationTool,
    removeIntegration,
  } = useActiveIntegrations()
  const { integrations } = useActiveIntegrationsStore((state) => ({
    integrations: state.integrations,
  }))

  return (
    <ToolsProvider
      addIntegrationTool={addIntegrationTool}
      removeIntegrationTool={removeIntegrationTool}
    >
      <SidebarSection title='Tools' actions={actions}>
        {integrations.map((integration) => (
          <ActiveIntegration
            key={integration.id}
            integration={integration}
            onRemove={removeIntegration}
          />
        ))}
      </SidebarSection>
      {open ? (
        <ConnectToolsModal
          onCloseModal={onClose}
          addNewIntegration={addNewIntegration}
        />
      ) : null}
    </ToolsProvider>
  )
}
