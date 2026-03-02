import { ReactNode } from 'react'
import { getLastLatteThreadUuidCached } from '$/app/(private)/_data-access'
import { LatteRealtimeUpdatesProvider } from '../providers/LatteRealtimeUpdatesProvider'
import { LatteLayout } from '$/components/LatteSidebar/LatteLayout'
import { fetchConversationWithMessages } from '@latitude-data/core/queries/conversations/fetchConversationWithMessages'
import type { Workspace } from '@latitude-data/core/schema/models/types/Workspace'

type Props = {
  children: ReactNode
  projectId: number
  workspace: Workspace
}

export async function LatteWrapper({ children, projectId, workspace }: Props) {
  const lastThreadUuid = await getLastLatteThreadUuidCached({ projectId })

  const conversationResult = lastThreadUuid
    ? await fetchConversationWithMessages({
        workspace,
        projectId,
        documentLogUuid: lastThreadUuid,
      })
    : undefined

  const initialMessages = conversationResult?.value?.messages

  return (
    <LatteRealtimeUpdatesProvider>
      <LatteLayout
        initialThreadUuid={lastThreadUuid}
        initialMessages={initialMessages}
      >
        {children}
      </LatteLayout>
    </LatteRealtimeUpdatesProvider>
  )
}
