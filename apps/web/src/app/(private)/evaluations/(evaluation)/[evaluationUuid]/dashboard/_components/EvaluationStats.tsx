'use client'

import { useEffect, useState } from 'react'

import { readMetadata } from '@latitude-data/compiler'
import { EvaluationDto } from '@latitude-data/core/browser'
import { ConnectedDocumentWithMetadata } from '@latitude-data/core/repositories'
import { Skeleton, Text } from '@latitude-data/web-ui'
import { formatCostInMillicents } from '$/app/_lib/formatUtils'
import useConnectedDocuments from '$/stores/connectedEvaluations'

export function Stat({ label, value }: { label: string; value?: string }) {
  return (
    <div className='w-full min-w-[100px] max-w-[300px] h-24 flex flex-col gap-2 px-6 py-2 justify-center border border-border rounded-lg'>
      <Text.H4M color='foregroundMuted'>{label}</Text.H4M>
      {value == undefined ? (
        <Skeleton className='w-[150px] h-8 bg-muted-foreground/10 animate-pulse' />
      ) : (
        <Text.H3B>{value}</Text.H3B>
      )}
    </div>
  )
}

export default function EvaluationStats({
  evaluation,
  connectedDocumentsWithMetadata,
}: {
  evaluation: EvaluationDto
  connectedDocumentsWithMetadata: ConnectedDocumentWithMetadata[]
}) {
  const [model, setModel] = useState<string>()
  const { data: connectedDocuments, isLoading: connectedDocumentsLoading } =
    useConnectedDocuments({ evaluation })

  useEffect(() => {
    readMetadata({ prompt: evaluation.metadata.prompt }).then((metadata) => {
      const metadataModel = (metadata.config['model'] as string) ?? 'Unknown'
      setModel(metadataModel)
    })
  }, [evaluation.metadata])

  return (
    <div className='flex gap-6'>
      <Stat
        label='Prompts'
        value={
          connectedDocumentsLoading
            ? undefined
            : connectedDocuments?.length.toString()
        }
      />
      <Stat label='Model' value={model} />
      <Stat
        label='Logs'
        value={connectedDocumentsWithMetadata
          .reduce((acc, doc) => acc + doc.evaluationLogs, 0)
          .toString()}
      />
      <Stat
        label='Cost'
        value={formatCostInMillicents(
          connectedDocumentsWithMetadata.reduce(
            (acc, doc) => acc + doc.costInMillicents,
            0,
          ),
        )}
      />
    </div>
  )
}
