import { useCallback, useMemo, useState } from 'react'
import useDocumentVersions from '$/stores/documentVersions'
import { DocumentType } from '@latitude-data/constants'
import {
  useCurrentCommit,
  useCurrentProject,
} from '@latitude-data/web-ui/providers'
import { Badge } from '@latitude-data/web-ui/atoms/Badge'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { Select, type SelectOption } from '@latitude-data/web-ui/atoms/Select'
import { type DocumentVersion } from '@latitude-data/core/browser'
import { useDocumentParameters } from '$/hooks/useDocumentParameters'
import { ReactStateDispatch } from '@latitude-data/web-ui/commonTypes'
import { Tooltip } from '@latitude-data/web-ui/atoms/Tooltip'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'

export function useDocumentSelection() {
  const { project } = useCurrentProject()
  const [selectedDocumentUuid, setSelectedDocumentUuid] = useState<string>('')
  const [payloadParameters, setPayloadParameters] = useState<string[]>([])
  const { data: documents } = useDocumentVersions({ projectId: project.id })
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

export function SelectPayloadParameters({
  document,
  payloadParameters,
  setPayloadParameters,
}: {
  payloadParameters: string[]
  setPayloadParameters: ReactStateDispatch<string[]>
  document: DocumentVersion
}) {
  const { commit } = useCurrentCommit()
  const {
    manual: { inputs },
  } = useDocumentParameters({
    document,
    commitVersionUuid: commit.uuid,
  })
  const parameterNames = Object.keys(inputs)
  const options = useMemo<SelectOption<string>[]>(
    () =>
      parameterNames.map((value) => ({
        label: value,
        value,
      })),
    [parameterNames],
  )
  const value = payloadParameters[0]
  const onSelectChange = useCallback(
    (value: string) => {
      setPayloadParameters([value])
    },
    [setPayloadParameters],
  )
  return (
    <div className='flex flex-col gap-2'>
      <div className='flex flex-row gap-x-1'>
        <Text.H5M>Prompt Parameter</Text.H5M>
        <Tooltip trigger={<Icon name='info' />}>
          Note: "Payload" refers to the data received from the trigger event. We
          currently do not know the exact structure of this data, so you may
          need to test your trigger to see what data is available.
        </Tooltip>
      </div>
      {parameterNames.length <= 0 ? (
        <Text.H6 color='foregroundMuted'>
          This prompt has no parameters. You can add a{' '}
          <Badge variant='accent'>{'{{payload}}'}</Badge> parameter to use the
          entire payload data.
        </Text.H6>
      ) : (
        <Select<string>
          name='payload-parameter'
          value={value}
          options={options}
          onChange={onSelectChange}
          description='Pick the parameter in your prompt that corresponds to the payload data. This will be used when the trigger event occurs.'
        />
      )}
    </div>
  )
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
