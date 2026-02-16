import { useMemo } from 'react'
import { useCurrentCommit } from '$/app/providers/CommitProvider'
import { useToggleModal } from '$/hooks/useToogleModal'
import { SidebarSection } from '../Section'
import { ConnectToolsModal } from './ConnectToolsModal'
import { usePromptConfigInSidebar } from '../hooks/usePromptConfigInSidebar'
import { ActiveIntegration } from './ActiveIntegration'
import { ToolsProvider } from './ToolsProvider'
import { useSidebarStore } from '../hooks/useSidebarStore'
import { CLIENT_TOOLS_INTEGRATION_NAME } from '../toolsHelpers/collectTools'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import Link from 'next/link'

const TOOLS_DOCS_URL = 'https://docs.latitude.so/guides/prompt-manager/tools'

export function ToolsSidebarSection({
  agentBuilder,
}: {
  agentBuilder: boolean
}) {
  const { commit } = useCurrentCommit()
  const isLive = !!commit.mergedAt
  const { open, onOpen, onClose } = useToggleModal()
  const actions = useMemo(
    () => (agentBuilder ? [{ onClick: onOpen, disabled: isLive }] : []),
    [onOpen, isLive, agentBuilder],
  )
  const {
    addNewIntegration,
    addIntegrationTool,
    removeIntegrationTool,
    removeIntegration,
  } = usePromptConfigInSidebar()
  const { integrations: allIntegrations } = useSidebarStore((state) => ({
    integrations: state.integrations,
  }))

  const integrations = useMemo(() => {
    if (agentBuilder) return allIntegrations
    return allIntegrations.filter(
      (integration) => integration.name === CLIENT_TOOLS_INTEGRATION_NAME,
    )
  }, [allIntegrations, agentBuilder])

  const showEmptyNote = !agentBuilder && integrations.length === 0

  return (
    <ToolsProvider
      addIntegrationTool={addIntegrationTool}
      removeIntegrationTool={removeIntegrationTool}
    >
      <SidebarSection title='Tools' actions={actions}>
        {showEmptyNote ? (
          <Text.H6 color='foregroundMuted'>
            Tools configured in the prompt will appear here.{' '}
            <Link
              href={TOOLS_DOCS_URL}
              target='_blank'
              rel='noopener noreferrer'
              className='underline'
            >
              Learn more
            </Link>
          </Text.H6>
        ) : (
          integrations.map((integration) => (
            <ActiveIntegration
              key={integration.name}
              integration={integration}
              onRemove={agentBuilder ? removeIntegration : undefined}
            />
          ))
        )}
      </SidebarSection>
      {agentBuilder && open ? (
        <ConnectToolsModal
          onCloseModal={onClose}
          addNewIntegration={addNewIntegration}
        />
      ) : null}
    </ToolsProvider>
  )
}
