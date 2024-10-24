'use client'

import { useMemo, useState } from 'react'
import { capitalize } from 'lodash-es'

import { MessageContent, TextContent } from '@latitude-data/compiler'
import { ProviderLogDto } from '@latitude-data/core/browser'
import {
  Badge,
  Button,
  CloseTrigger,
  Modal,
  roleVariant,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Text,
} from '@latitude-data/web-ui'
import { ProjectDocumentSelector } from '$/components/ProjectDocumentSelector'
import { useNavigate } from '$/hooks/useNavigate'
import { relativeTime } from '$/lib/relativeTime'
import { ROUTES } from '$/services/routes'
import useDocumentsForImport from '$/stores/documentsForImport'
import useProviderLogs from '$/stores/providerLogs'

export default function ImportLogs({
  params: { evaluationUuid },
}: {
  params: { evaluationUuid: string }
}) {
  const navigate = useNavigate()
  const [documentUuid, setDocumentUuid] = useState<string | undefined>()
  const [providerLogId, setProviderLogId] = useState<number | undefined>()
  const [projectId, setProjectId] = useState<number | undefined>()
  const { data: documents } = useDocumentsForImport({ projectId })

  const handleProjectChange = (projectId: number) => {
    // Reset document selection when project changes
    setProjectId(projectId)
    setDocumentUuid(undefined)
    setProviderLogId(undefined)
  }

  const handleDocumentChange = (newDocumentUuid: string) => {
    setDocumentUuid(newDocumentUuid)
    setProviderLogId(undefined)
  }

  return (
    <Modal
      open
      onOpenChange={() => {
        navigate.push(
          ROUTES.evaluations.detail({ uuid: evaluationUuid }).editor.root,
        )
      }}
      title='Import logs'
      description='Import data from an existing log to add it to your variables. Then test your evaluation prompt to see how it performs.'
      size='large'
      footer={
        <>
          <CloseTrigger />
          <Button
            fancy
            disabled={!providerLogId}
            onClick={() => {
              navigate.push(
                `${ROUTES.evaluations.detail({ uuid: evaluationUuid }).editor.root}?providerLogId=${providerLogId}`,
              )
            }}
          >
            Import log
          </Button>
        </>
      }
    >
      <div className='flex flex-col gap-4 min-w-0'>
        <ProjectDocumentSelector
          documents={documents}
          onProjectChange={handleProjectChange}
          onDocumentChange={handleDocumentChange}
        />
        {documentUuid && (
          <ProviderLogsTable
            documentUuid={documentUuid}
            setProviderLogId={setProviderLogId}
          />
        )}
        {documentUuid && (
          <ProviderLogMessages
            documentUuid={documentUuid}
            providerLogId={providerLogId}
          />
        )}
      </div>
    </Modal>
  )
}

const ProviderLogsTable = ({
  documentUuid,
  setProviderLogId: setProviderLogId,
}: {
  documentUuid: string
  setProviderLogId: (id: number) => void
}) => {
  const { data = [] } = useProviderLogs({ documentUuid })
  const orderedData = useMemo(() => [...data].reverse(), [data])
  if (!orderedData.length) {
    return (
      <div className='flex flex-col items-center justify-center rounded-lg border border-2 bg-secondary p-4'>
        <Text.H5M color='foregroundMuted'>No logs available</Text.H5M>
      </div>
    )
  }

  return (
    <div className='overflow-auto max-h-[480px]'>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>
              <Text.H4>Created at</Text.H4>
            </TableHead>
            <TableHead>
              <Text.H4>Messages</Text.H4>
            </TableHead>
            <TableHead>
              <Text.H4>Tokens</Text.H4>
            </TableHead>
            <TableHead>
              <Text.H4>Prompt</Text.H4>
            </TableHead>
            <TableHead>
              <Text.H4>Type</Text.H4>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {orderedData?.map((log) => (
            <TableRow
              key={log.id}
              onClick={() => setProviderLogId(log.id)}
              className='cursor-pointer'
              role='button'
            >
              <TableCell>
                <Text.H4 noWrap>{relativeTime(log.generatedAt)}</Text.H4>
              </TableCell>
              <TableCell>{log.messages.length + 1}</TableCell>
              <TableCell>{log.tokens}</TableCell>
              <TableCell>
                <Text.H4 noWrap>
                  {ellipsis(
                    printMessageContent(
                      log.messages[log.messages.length - 1]!.content,
                    ),
                  )}
                </Text.H4>
              </TableCell>
              <TableCell>{capitalize(log.source)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

const ProviderLogMessages = ({
  documentUuid,
  providerLogId,
}: {
  documentUuid?: string
  providerLogId?: number
}) => {
  const { data } = useProviderLogs({ documentUuid })
  const providerLog = data?.find(
    (log) => log.id === providerLogId,
  ) as ProviderLogDto
  if (!providerLog) {
    return (
      <div className='flex flex-col items-center justify-center rounded-lg border-2 bg-secondary p-4 h-[480px]'>
        <Text.H5M color='foregroundMuted'>
          Select a log on the table to preview the messages here and import
        </Text.H5M>
      </div>
    )
  }

  return (
    <div className='rounded-lg border-2 bg-secondary p-4 overflow-y-auto max-h-[480px]'>
      <Text.H5M>Messages</Text.H5M>
      <div className='flex flex-col gap-2'>
        {providerLog.messages.map((message, index) => (
          <div key={index} className='flex flex-col gap-1'>
            <div>
              <Badge variant={roleVariant(message.role)}>
                {capitalize(message.role)}
              </Badge>
            </div>
            <div className='pl-4'>
              <Text.H6M>{printMessageContent(message.content)}</Text.H6M>
            </div>
          </div>
        ))}
        <div className='flex flex-col gap-1'>
          <div>
            <Badge variant={roleVariant('assistant')}>Assistant</Badge>
          </div>
          <div className='pl-4'>
            <Text.H6M>{printMessageContent(providerLog.response)}</Text.H6M>
          </div>
        </div>
      </div>
    </div>
  )
}

const printMessageContent = (content: string | MessageContent[]) => {
  if (typeof content === 'string') return content
  if (content[0]!.type === 'text') return (content[0] as TextContent).text

  return '-'
}

function ellipsis(str: string) {
  if (!str) return null
  return str.length > 30 ? str.substring(0, 30) + '...' : str
}
