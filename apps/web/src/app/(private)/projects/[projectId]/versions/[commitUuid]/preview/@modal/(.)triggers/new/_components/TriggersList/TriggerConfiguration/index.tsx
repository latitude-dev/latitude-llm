import { useState } from 'react'
import type {
  AppDto,
  DocumentTrigger,
  IntegrationDto,
} from '@latitude-data/core/browser'
import { Text } from '@latitude-data/web-ui/atoms/Text'

import { type Trigger } from '../index'
import { ConnectAccount } from './ConnectAccount'
import {
  useDocumentSelection,
  SelectDocument,
  SelectPayloadParameters,
} from './SelectDocument'
import { ConfigureTrigger } from './ConfigureTrigger'

export function TriggerConfiguration({
  trigger,
  pipedreamApp,
  onTriggerCreated,
}: {
  trigger: Trigger
  pipedreamApp: AppDto
  onTriggerCreated: (documentTrigger: DocumentTrigger) => void
}) {
  const [account, setAccount] = useState<IntegrationDto | undefined>(undefined)
  const doc = useDocumentSelection()

  return (
    <div className='flex flex-col gap-y-4 min-w-0'>
      <div className='flex flex-col'>
        <Text.H7 uppercase>new trigger</Text.H7>
        <Text.H4>{trigger.name}</Text.H4>
        <Text.H5 color='foregroundMuted' lineClamp={2}>
          {trigger.description}
        </Text.H5>
      </div>

      <hr className='border-t border-border' />

      <ConnectAccount
        account={account}
        setAccount={setAccount}
        pipedreamApp={pipedreamApp}
      />

      {account ? (
        <SelectDocument
          document={doc.document}
          onSelectDocument={doc.onSelectDocument}
          options={doc.options}
        />
      ) : null}

      {doc.document ? (
        <SelectPayloadParameters
          document={doc.document}
          payloadParameters={doc.payloadParameters}
          setPayloadParameters={doc.onSetPayloadParameters}
        />
      ) : null}

      {account && doc.document ? (
        <ConfigureTrigger
          key={trigger.key}
          triggerComponent={trigger}
          account={account}
          document={doc.document}
          onTriggerCreated={onTriggerCreated}
          payloadParameters={doc.payloadParameters}
        />
      ) : null}
    </div>
  )
}
