import { useMemo, useState } from 'react'
import useDocumentVersions from '$/stores/documentVersions'
import { DocumentType } from '@latitude-data/constants'
import {
  useCurrentCommit,
  useCurrentProject,
} from '@latitude-data/web-ui/providers'
import { Select, type SelectOption } from '@latitude-data/web-ui/atoms/Select'
import { type DocumentVersion } from '@latitude-data/core/browser'
import { ReactStateDispatch } from '@latitude-data/web-ui/commonTypes'

export function useDocumentSelection() {
  const { project } = useCurrentProject()
  const [selectedDocumentUuid, setSelectedDocumentUuid] = useState<string>('')
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
