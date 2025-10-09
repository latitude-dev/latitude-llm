import { useMemo } from 'react'
import { useCurrentCommit } from '$/app/providers/CommitProvider'
import { useToggleModal } from '$/hooks/useToogleModal'
import { SidebarSection } from '../Section'
import { ConnectToolsModal } from './ConnectToolsModal'

export function ToolsSidebarSection() {
  const { commit } = useCurrentCommit()
  const isLive = !!commit.mergedAt
  const { open, onOpen, onClose } = useToggleModal()
  const actions = useMemo(
    () => [{ onClick: onOpen, disabled: isLive }],
    [onOpen, isLive],
  )
  return (
    <>
      <SidebarSection title='Tools' actions={actions}>
        TO BE LISTED
      </SidebarSection>
      {open ? <ConnectToolsModal onCloseModal={onClose} /> : null}
    </>
  )
}
