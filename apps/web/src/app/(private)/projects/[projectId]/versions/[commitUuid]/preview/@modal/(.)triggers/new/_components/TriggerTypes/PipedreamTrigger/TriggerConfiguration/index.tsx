import { useState } from 'react'
import type {
  AppDto,
  DocumentTrigger,
  IntegrationDto,
} from '@latitude-data/core/browser'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { PipedreamComponentPropsForm } from '$/components/Pipedream/PipedreamPropsForm'
import { type Trigger } from '../index'
import { ConnectAccount } from './ConnectAccount'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { useCreateDocumentTrigger } from './useCreateDocumentTrigger'
import { FormWrapper } from '@latitude-data/web-ui/atoms/FormWrapper'
import { SelectPayloadParameters } from '$/app/(private)/projects/[projectId]/versions/[commitUuid]/preview/@modal/(.)triggers/_components/TriggerForms/IntegrationTriggerForm/SelectPayloadParameters'
import { useParsedPipedreamTriggerDescription } from '$/app/(private)/projects/[projectId]/versions/[commitUuid]/preview/@modal/(.)triggers/_components/TriggerForms/IntegrationTriggerForm/usePipedreamTriggerDescription'
import {
  useDocumentSelection,
  SelectDocument,
} from '../../../../../_components/SelectDocument'

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
  const triggerCreator = useCreateDocumentTrigger({
    account,
    document: doc.document,
    onTriggerCreated,
    triggerComponent: trigger,
    payloadParameters: doc.payloadParameters,
  })
  const canCreateTrigger = account && doc.document
  const parsedText = useParsedPipedreamTriggerDescription({
    pipedreamTrigger: trigger,
  })
  return (
    <div className='flex flex-col gap-y-4 min-w-0'>
      <div>
        <Text.H4 display='block'>{trigger.name}</Text.H4>
        <Text.H5 asChild color='foregroundMuted' display='block'>
          <div
            className='[&>a]:underline [&>a]:text-foreground'
            dangerouslySetInnerHTML={{
              __html: parsedText,
            }}
          />
        </Text.H5>
      </div>

      <hr className='border-t border-border' />

      <FormWrapper>
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

        {canCreateTrigger ? (
          <>
            <PipedreamComponentPropsForm
              key={trigger.key}
              integration={account}
              component={trigger}
              values={triggerCreator.configuredProps}
              onChange={triggerCreator.setConfiguredProps}
              disabled={triggerCreator.isCreating}
            />
            <Button
              fancy
              fullWidth
              disabled={!canCreateTrigger || triggerCreator.isCreating}
              onClick={triggerCreator.onCreateTrigger}
            >
              Create trigger
            </Button>
          </>
        ) : null}
      </FormWrapper>
    </div>
  )
}
