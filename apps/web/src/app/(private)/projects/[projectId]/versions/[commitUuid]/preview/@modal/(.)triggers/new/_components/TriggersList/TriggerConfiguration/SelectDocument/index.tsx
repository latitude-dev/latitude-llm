import { useMemo, useState } from 'react'
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
  return (
    <div className='flex flex-col gap-2'>
      <div className='flex flex-row gap-x-1'>
        <Text.H5M>Prompt Parameters</Text.H5M>
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
        <div className='grid grid-cols-[auto_1fr] gap-y-3'>
          {parameterNames.map((paramName) => {
            const value = payloadParameters.includes(paramName)
              ? 'payload'
              : undefined
            return (
              <div
                className='min-w-0 grid col-span-2 grid-cols-subgrid gap-x-3 w-full items-start'
                key={paramName}
              >
                <div className='flex h-8 items-center'>
                  <Badge variant={value ? 'accent' : 'muted'} noWrap ellipsis>
                    {`{{${paramName}}}`}
                  </Badge>
                </div>
                <Select
                  name={paramName}
                  options={[{ value: 'payload', label: 'Payload' }]}
                  info='Test info text'
                  value={value}
                  onChange={(newValue) => {
                    if (value === newValue) return
                    setPayloadParameters((prev) => {
                      if (newValue) return [...prev, paramName]
                      return prev.filter((p) => p !== paramName)
                    })
                  }}
                />
              </div>
            )
          })}
        </div>
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
