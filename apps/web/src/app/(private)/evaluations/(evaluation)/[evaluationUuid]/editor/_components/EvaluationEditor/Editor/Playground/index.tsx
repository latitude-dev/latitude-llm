'use client'

import { useMemo, useState } from 'react'

import { ConversationMetadata } from '@latitude-data/compiler'
import { EvaluationDto } from '@latitude-data/core/browser'
import {
  formatContext,
  formatConversation,
} from '@latitude-data/core/services/providerLogs/serialize'
import { Button, Icon, TableBlankSlate, Text } from '@latitude-data/web-ui'
import { ROUTES } from '$/services/routes'
import useDocumentLogWithMetadata from '$/stores/documentLogWithMetadata'
import { useProviderLog } from '$/stores/providerLogs'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'

import { Header } from '../Header'
import Chat from './Chat'
import Preview from './Preview'
import { Variables } from './Variables'

const BlankSlate = ({ evaluation }: { evaluation: EvaluationDto }) => (
  <>
    <Header title='Playground' />
    <TableBlankSlate
      description='Import data from an existing log to add it to your variables. Then test your evaluation prompt to see how it performs.'
      link={
        <Link
          href={
            ROUTES.evaluations.detail({ uuid: evaluation.uuid }).editor
              .importLogs.root
          }
        >
          <Button fancy>Import Log</Button>
        </Link>
      }
    />
  </>
)

export default function Playground({
  evaluation,
  metadata,
}: {
  evaluation: EvaluationDto
  metadata: ConversationMetadata
}) {
  const [mode, setMode] = useState<'preview' | 'chat'>('preview')
  const searchParams = useSearchParams()
  const providerLogId = searchParams.get('providerLogId')
  const { data: providerLog } = useProviderLog(
    providerLogId ? Number(providerLogId) : undefined,
  )
  const { data: documentLogWithMetadata } = useDocumentLogWithMetadata(
    providerLog?.documentLogUuid,
  )
  const parameters = useMemo(() => {
    if (!providerLog || !documentLogWithMetadata) {
      return {
        messages: [],
        context: '',
        response: '',
        config: {},
        prompt: '',
        duration: 0,
        parameters: {},
        cost: 0,
      }
    }

    return {
      messages: formatConversation(providerLog),
      context: formatContext(providerLog),
      response: providerLog.response,
      config: providerLog.config,
      prompt: documentLogWithMetadata.resolvedContent,
      duration: documentLogWithMetadata.duration,
      parameters: documentLogWithMetadata.parameters,
      cost: (documentLogWithMetadata.costInMillicents || 0) / 1000,
    }
  }, [documentLogWithMetadata, providerLog])

  if (!providerLog) {
    return <BlankSlate evaluation={evaluation} />
  }

  return (
    <>
      <div className='flex flex-row justify-between items-center'>
        <Header title='Playground' />
        {providerLog && (
          <Link
            className='flex flex-row gap-2 items-center'
            href={
              ROUTES.evaluations.detail({ uuid: evaluation.uuid }).editor
                .importLogs.root
            }
          >
            <Text.H5M>Import another log</Text.H5M> <Icon name='addSquare' />
          </Link>
        )}
      </div>
      <div className='flex flex-col gap-6'>
        <Variables providerLog={providerLog} />
        <div className='flex flex-col flex-grow'>
          <div className='flex flex-col flex-grow flex-shrink relative h-full overflow-y-auto custom-scrollbar'>
            {mode === 'preview' ? (
              <Preview
                metadata={metadata}
                parameters={parameters}
                runPrompt={() => setMode('chat')}
              />
            ) : (
              <Chat
                evaluation={evaluation}
                parameters={parameters}
                clearChat={() => setMode('preview')}
              />
            )}
          </div>
        </div>
      </div>
    </>
  )
}
