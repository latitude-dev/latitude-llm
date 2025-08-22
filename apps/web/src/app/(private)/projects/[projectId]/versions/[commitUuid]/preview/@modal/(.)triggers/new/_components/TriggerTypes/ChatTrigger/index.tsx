import { useCallback, useMemo } from 'react'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { DocumentTriggerType } from '@latitude-data/constants'
import {
  useCurrentCommit,
  useCurrentProject,
} from '@latitude-data/web-ui/providers'
import useDocumentTriggers from '$/stores/documentTriggers'
import { type OnTriggerCreated } from '../../../client'
import {
  SelectDocument,
  useDocumentSelection,
} from '../../../../_components/SelectDocument'
import { TriggerWrapper } from '../TriggerWrapper'

export function ChatTrigger({
  onTriggerCreated,
}: {
  onTriggerCreated: OnTriggerCreated
}) {
  const documentSelection = useDocumentSelection()
  const { project } = useCurrentProject()
  const { commit } = useCurrentCommit()
  const document = documentSelection.document
  const {
    data: triggers,
    create,
    isCreating,
  } = useDocumentTriggers(
    {
      projectId: project.id,
      commitUuid: commit.uuid,
    },
    {
      onCreated: (trigger) => {
        onTriggerCreated(trigger)
      },
    },
  )
  const disabled = !!commit.mergedAt || isCreating
  const documentUuid = document?.documentUuid
  const filteredOptions = useMemo(() => {
    const existingChatsDocumentUuids = triggers
      .filter((t) => t.triggerType === DocumentTriggerType.Chat)
      .map((t) => t.documentUuid)
    return documentSelection.options.filter(
      (o) => !existingChatsDocumentUuids.includes(o.value),
    )
  }, [triggers, documentSelection.options])
  const onCreate = useCallback(() => {
    if (!documentUuid) return

    create({
      documentUuid,
      triggerType: DocumentTriggerType.Chat,
      configuration: {},
    })
  }, [create, documentUuid])
  return (
    <TriggerWrapper
      title='Chat Trigger'
      description='Allow users to chat with this prompt'
    >
      <SelectDocument
        options={filteredOptions}
        document={document}
        onSelectDocument={documentSelection.onSelectDocument}
      />
      {document ? (
        <Button variant='default' fancy onClick={onCreate} disabled={disabled}>
          {isCreating ? 'Creating trigger...' : 'Create trigger'}
        </Button>
      ) : null}
    </TriggerWrapper>
  )
}
