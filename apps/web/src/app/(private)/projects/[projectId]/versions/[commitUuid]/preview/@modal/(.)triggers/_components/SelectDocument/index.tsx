import { useEffect, useMemo, useState } from 'react'
import useDocumentVersions from '$/stores/documentVersions'
import { DocumentType } from '@latitude-data/constants'
import { useCurrentCommit } from '$/app/providers/CommitProvider'
import { useCurrentProject } from '$/app/providers/ProjectProvider'
import { Select, type SelectOption } from '@latitude-data/web-ui/atoms/Select'
import { ReactStateDispatch } from '@latitude-data/web-ui/commonTypes'
import { useMetadata } from '$/hooks/useMetadata'
import { DocumentVersion } from '@latitude-data/core/schema/types'

export function useDocumentSelection({
  initialDocumentUuid = '',
}: { initialDocumentUuid?: string } = {}) {
  const { project } = useCurrentProject()
  const [selectedDocumentUuid, setSelectedDocumentUuid] =
    useState<string>(initialDocumentUuid)
  const { commit } = useCurrentCommit()
  const [payloadParameters, setPayloadParameters] = useState<string[]>([])
  const { data: documents } = useDocumentVersions({
    projectId: project.id,
    commitUuid: commit.uuid,
  })

  return useMemo(() => {
    const document = documents.find(
      (d) => d.documentUuid === selectedDocumentUuid,
    )
    return {
      document,
      payloadParameters,
      onSelectDocument: setSelectedDocumentUuid,
      onSetPayloadParameters: setPayloadParameters,
      options: documents.map((d) => ({
        label: d.path,
        value: d.documentUuid,
        icon: d.documentType === DocumentType.Agent ? 'bot' : 'file',
      })),
    }
  }, [documents, selectedDocumentUuid, payloadParameters])
}

export function SelectDocument({
  document,
  onSelectDocument,
  options,
}: {
  document?: DocumentVersion
  options: SelectOption<string>[]
  onSelectDocument: ReactStateDispatch<string>
}) {
  const { updateMetadata } = useMetadata()
  useEffect(() => {
    if (!document) return

    updateMetadata({
      promptlVersion: document.promptlVersion,
      prompt: document.content,
      document,
    })
  }, [document, updateMetadata])

  return (
    <Select
      name='prompt'
      label='Prompt'
      required
      searchable
      value={document?.documentUuid || ''}
      options={options}
      onChange={onSelectDocument}
      placeholder='Select a prompt'
      description='Select the prompt that should be executed with this trigger'
    />
  )
}
