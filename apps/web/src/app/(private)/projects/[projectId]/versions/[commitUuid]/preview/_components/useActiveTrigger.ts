import { useCallback, useEffect, useMemo, useState } from 'react'
import useDocumentVersions from '$/stores/documentVersions'
import { DocumentTriggerType } from '@latitude-data/constants'
import {
  Commit,
  DocumentTrigger,
  DocumentVersion,
  Project,
} from '@latitude-data/core/browser'

type ActiveChatTrigger = {
  document: DocumentVersion
  trigger: DocumentTrigger<DocumentTriggerType.Chat>
}

export type OnRunChatTrigger = ({
  document,
  trigger,
}: ActiveChatTrigger) => void

export function useActiveChatTrigger({
  commit,
  project,
  triggers,
}: {
  triggers: DocumentTrigger[]
  commit: Commit
  project: Project
}) {
  const [chatBoxFocused, setChatBoxFocused] = useState(false)
  const { data: documents } = useDocumentVersions({
    projectId: project.id,
    commitUuid: commit.uuid,
  })

  const [activeChatTrigger, setActiveChatTrigger] =
    useState<ActiveChatTrigger>()
  const onRunChatTrigger: OnRunChatTrigger = useCallback(
    ({ trigger, document }) => {
      setActiveChatTrigger({ trigger, document })
      setChatBoxFocused(true)

      // After half a second reset focus to false to be able to focus again.
      const timer = setTimeout(() => {
        setChatBoxFocused(false)
      }, 500)

      return () => clearTimeout(timer)
    },
    [],
  )

  useEffect(() => {
    const chatTriggers = triggers.filter(
      (t): t is DocumentTrigger<DocumentTriggerType.Chat> =>
        t.triggerType === DocumentTriggerType.Chat,
    )

    // --- Case 1: no chat triggers at all ---
    if (chatTriggers.length === 0) {
      if (activeChatTrigger) {
        setActiveChatTrigger(undefined)
      }
      return
    }

    // --- Case 2: we have an active one ---
    if (activeChatTrigger) {
      const stillExists = chatTriggers.find(
        (t) => t.documentUuid === activeChatTrigger.trigger.documentUuid,
      )

      if (!stillExists) {
        // Active one was removed → clear
        setActiveChatTrigger(undefined)
        return
      }

      // Active one still exists → maybe its document changed
      const newDoc = documents.find(
        (d) => d.documentUuid === activeChatTrigger.trigger.documentUuid,
      )
      if (newDoc && newDoc !== activeChatTrigger.document) {
        setActiveChatTrigger({
          trigger: activeChatTrigger.trigger,
          document: newDoc,
        })
      }
      return
    }

    // --- Case 3: no active trigger yet → pick one automatically ---
    const first = chatTriggers[0]
    const doc = documents.find((d) => d.documentUuid === first.documentUuid)

    if (doc) {
      setActiveChatTrigger({ trigger: first, document: doc })
    }
  }, [documents, triggers, activeChatTrigger])

  const onChange = useCallback(
    (newTriggerUuid: string) => {
      const chatTrigger = triggers.find(
        (t): t is DocumentTrigger<DocumentTriggerType.Chat> =>
          t.triggerType === DocumentTriggerType.Chat &&
          t.uuid === newTriggerUuid,
      )
      if (!chatTrigger) return null

      const doc = documents.find(
        (d) => d.documentUuid === chatTrigger.documentUuid,
      )
      if (!doc) return null

      setActiveChatTrigger({ trigger: chatTrigger, document: doc })
    },
    [documents, triggers],
  )

  return useMemo(() => {
    const options = triggers
      .filter((trigger) => trigger.triggerType === DocumentTriggerType.Chat)
      .map((trigger) => {
        const document = documents.find(
          (d) => d.documentUuid === trigger.documentUuid,
        )!
        return {
          label: document?.path?.split('/')?.at(-1) ?? '',
          value: trigger.uuid,
        }
      })
    const activeKey = `${activeChatTrigger?.trigger.uuid}-${activeChatTrigger?.document?.documentUuid}`
    return {
      active: activeChatTrigger,
      activeKey,
      chatBoxFocused,
      onRunChatTrigger,
      options,
      onChange,
    }
  }, [
    documents,
    triggers,
    activeChatTrigger,
    chatBoxFocused,
    onRunChatTrigger,
    onChange,
  ])
}
