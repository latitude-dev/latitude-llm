import { useEffect, useState } from 'react'

import { Config, readMetadata } from '@latitude-data/compiler'
import { ProviderLogDto } from '@latitude-data/core/browser'
import {
  formatContext,
  formatConversation,
} from '@latitude-data/core/services/providerLogs/serialize'
import { Button, Icon, Tooltip } from '@latitude-data/web-ui'
import useDocumentLogWithMetadata from '$/stores/documentLogWithMetadata'

import { PinnedDocumentation } from '../components/PinnedDocumentation'

export const useVariablesData = (providerLog: ProviderLogDto) => {
  const [config, setConfig] = useState<Config>()
  const { data: documentLogWithMetadata } = useDocumentLogWithMetadata({
    documentLogUuid: providerLog.documentLogUuid,
  })
  const [isMessagesPinned, setIsMessagesPinned] = useState(false)
  const [isPopoverOpen, setIsPopoverOpen] = useState(false)

  useEffect(() => {
    const fn = async () => {
      if (!documentLogWithMetadata) return

      const metadata = await readMetadata({
        prompt: documentLogWithMetadata!.resolvedContent,
      })
      setConfig(metadata.config)
    }

    fn()
  }, [documentLogWithMetadata])

  const variableSections = [
    {
      title: 'messages',
      content: JSON.stringify(formatConversation(providerLog), null, 2),
      height: '36',
      tooltip: 'The full conversation including the last assistant response',
      popover: (
        <div className='flex flex-col gap-4 relative pt-8'>
          <div className='absolute top-2 right-2'>
            <Button
              variant='nope'
              onClick={() => {
                setIsMessagesPinned(true)
                setIsPopoverOpen(false)
              }}
            >
              <Tooltip
                trigger={
                  <div>
                    <Icon
                      name='pin'
                      color={isMessagesPinned ? 'primary' : 'foregroundMuted'}
                    />
                  </div>
                }
              >
                Pin documentation
              </Tooltip>
            </Button>
          </div>
          <PinnedDocumentation isPinned={false} />
        </div>
      ),
    },
    {
      title: 'context',
      content: formatContext(providerLog),
      tooltip: 'The full conversation excluding the last assistant response',
    },
    {
      title: 'response',
      content: providerLog.response,
      tooltip: 'The last assistant response',
    },
    {
      title: 'prompt',
      content: documentLogWithMetadata?.resolvedContent || '',
      tooltip: 'The original prompt',
    },
    {
      title: 'config',
      content: config ? JSON.stringify(config, null, 2) : '',
      tooltip: 'The prompt configuration used to generate the prompt',
      height: '24',
    },
    {
      title: 'parameters',
      content: documentLogWithMetadata?.parameters
        ? JSON.stringify(documentLogWithMetadata.parameters, null, 2)
        : '',
      tooltip: 'The parameters that were used to build the prompt for this log',
      height: '24',
    },
  ]

  const inputSections = [
    {
      title: 'duration',
      content: documentLogWithMetadata?.duration?.toString() || '0',
      tooltip: 'The time it took to run this prompt in milliseconds',
      type: 'number',
    },
    {
      title: 'cost',
      content: documentLogWithMetadata?.costInMillicents
        ? (documentLogWithMetadata?.costInMillicents / 1000).toString()
        : '0',
      tooltip: 'The cost of running this prompt in cents',
      type: 'number',
    },
  ]

  return {
    variableSections,
    inputSections,
    isMessagesPinned,
    setIsMessagesPinned,
    isPopoverOpen,
    setIsPopoverOpen,
  }
}
